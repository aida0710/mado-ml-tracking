import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Artifact,
  Dataset,
  DatasetVersion,
  PluginConnection,
  PluginEvent,
  Project,
  Run,
  WorkerJob,
} from '@mmt/contracts';
import type { ArtifactStores } from '@mmt/platform';
import { createApplication } from '../src/app.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { executionFixture, referenceDigest } from './fixtures.js';
import { seedDemo } from '../src/seed/demoSeed.js';
import type { BuiltinPluginClient } from '../src/plugins/mado/madoPlugin.js';
import { MADO_CREDENTIALS_FIXTURE, madoClientStub, madoPluginInput } from './pluginFixtures.js';

describe.skipIf(!testDatabaseUrl)('Artifactとplugin outbox（独立PostgreSQL）', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
  });
  afterAll(async () => {
    await harness?.close();
  });

  it('Artifactは実ファイル・size・sha256を保存し、Rangeで一部を返す', async () => {
    const fixture = await executionFixture(harness);
    const run = await fixture.newRun();
    const content = '0123456789';
    const artifact = await entity<Artifact>(
      await request(
        harness.app,
        `${fixture.basePath}/runs/${run.id}/artifacts?path=output/weights.bin`,
        {
          method: 'PUT',
          cookie: fixture.editor.cookie,
          binary: content,
          headers: { 'Content-Type': 'application/octet-stream' },
        },
      ),
    );
    expect(artifact.runId).toBe(run.id);
    expect(artifact.size).toBe(10);
    expect(artifact.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    const downloaded = await request(
      harness.app,
      `${fixture.basePath}/artifacts/${artifact.id}/content`,
      { cookie: fixture.viewer.cookie, headers: { Range: 'bytes=2-5' } },
    );
    expect(downloaded.status).toBe(206);
    expect(downloaded.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(await downloaded.text()).toBe('2345');
    const invalidRange = await request(
      harness.app,
      `${fixture.basePath}/artifacts/${artifact.id}/content`,
      { cookie: fixture.viewer.cookie, headers: { Range: 'bytes=20-30' } },
    );
    expect(invalidRange.status).toBe(416);
    expect(invalidRange.headers.get('Content-Range')).toBe('bytes */10');
    expect(
      (
        await request(harness.app, `${fixture.basePath}/artifacts/${artifact.id}/content`, {
          cookie: fixture.outsider.cookie,
        })
      ).status,
    ).toBe(403);
  });

  it('危険なHTML/SVGはattachmentになり、パス traversalとviewerのアップロードを拒否する', async () => {
    const fixture = await executionFixture(harness);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/artifacts?path=../escape`, {
          method: 'PUT',
          cookie: fixture.editor.cookie,
          binary: 'payload',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/artifacts?path=safe`, {
          method: 'PUT',
          cookie: fixture.viewer.cookie,
          binary: 'payload',
        })
      ).status,
    ).toBe(403);
    for (const [path, mimeType] of [
      ['page.html', 'text/html'],
      ['vector.svg', 'image/svg+xml'],
    ]) {
      const artifact = await entity<Artifact>(
        await request(harness.app, `${fixture.basePath}/artifacts?path=${path}`, {
          method: 'PUT',
          cookie: fixture.editor.cookie,
          binary: '<script>alert(1)</script>',
          headers: { 'Content-Type': mimeType! },
        }),
      );
      const downloaded = await request(
        harness.app,
        `${fixture.basePath}/artifacts/${artifact.id}/content`,
        { cookie: fixture.viewer.cookie },
      );
      expect(downloaded.headers.get('Content-Disposition')).toMatch(/^attachment;/);
      expect(downloaded.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(downloaded.headers.get('Content-Security-Policy')).toContain('sandbox');
      await downloaded.arrayBuffer();
    }
  });

  it('store.put失敗は503になり、DBに成功を記録しない', async () => {
    const fixture = await executionFixture(harness);
    const remove = vi.fn(async () => undefined);
    const failingStores: ArtifactStores = {
      backends: () => ['filesystem'],
      put: async () => {
        throw new Error('Disk failure');
      },
      read: harness.stores.read,
      remove,
      multipart: () => null,
    };
    const { app } = createApplication({
      config: harness.config,
      database: harness.database,
      stores: failingStores,
    });
    const response = await request(app, `${fixture.basePath}/artifacts?path=failed.bin`, {
      method: 'PUT',
      cookie: fixture.editor.cookie,
      binary: 'data',
    });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('artifact_save_failed');
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM artifacts')).rows[0].count,
    ).toBe(0);
    expect(remove).toHaveBeenCalledOnce();
  });

  it('blob保存後のDB失敗では保存した実ファイルをcleanupする', async () => {
    const fixture = await executionFixture(harness);
    let written: { backend: string; key: string } | undefined;
    const stores: ArtifactStores = {
      ...harness.stores,
      put: async (upload) => {
        written = { backend: upload.backend, key: upload.key };
        return harness.stores.put(upload);
      },
    };
    const { app } = createApplication({
      config: harness.config,
      database: harness.database,
      stores,
    });
    await harness.database.query(
      "CREATE FUNCTION fail_artifact_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$",
    );
    await harness.database.query(
      'CREATE TRIGGER fail_artifact_insert BEFORE INSERT ON artifacts FOR EACH ROW EXECUTE FUNCTION fail_artifact_insert()',
    );
    try {
      expect(
        (
          await request(app, `${fixture.basePath}/artifacts?path=db-failed.bin`, {
            method: 'PUT',
            cookie: fixture.editor.cookie,
            binary: 'actual blob',
          })
        ).status,
      ).toBe(503);
      expect(written).toBeDefined();
      await expect(harness.stores.read(written!)).rejects.toMatchObject({
        name: 'ArtifactNotFoundError',
      });
      expect(
        (await harness.database.query('SELECT count(*)::int AS count FROM artifacts')).rows[0]
          .count,
      ).toBe(0);
    } finally {
      await harness.database.query('DROP TRIGGER fail_artifact_insert ON artifacts');
      await harness.database.query('DROP FUNCTION fail_artifact_insert()');
    }
  });

  it('Project管理者はMado接続を登録できず、全体管理者が登録した接続を確認できる', async () => {
    const fixture = await executionFixture(harness);
    const project = await entity<Project>(
      await request(harness.app, '/api/projects', {
        method: 'POST',
        cookie: fixture.outsider.cookie,
        body: { name: 'Member-owned Project' },
      }),
    );
    const clientFactory = vi.fn((): BuiltinPluginClient => madoClientStub());
    const { app } = createApplication({
      config: harness.config,
      database: harness.database,
      stores: harness.stores,
      pluginClientFactory: clientFactory,
    });
    const basePath = `/api/projects/${project.id}/plugins`;
    const rejected = await request(app, basePath, {
      method: 'POST',
      cookie: fixture.outsider.cookie,
      body: madoPluginInput({ name: 'Unapproved destination' }),
    });
    expect(rejected.status).toBe(403);
    expect((await rejected.json()).code).toBe('admin_required');
    expect(clientFactory).not.toHaveBeenCalled();
    const approved = await entity<PluginConnection>(
      await request(app, basePath, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput({ name: 'Approved destination' }),
      }),
    );
    await entity(
      await request(app, `${basePath}/${approved.id}/check`, {
        method: 'POST',
        cookie: fixture.outsider.cookie,
      }),
      200,
    );
    expect(clientFactory).toHaveBeenCalledOnce();
    expect(clientFactory).toHaveBeenCalledWith(expect.objectContaining({
      config: madoPluginInput().config,
      credentials: expect.objectContaining({
        readToken: MADO_CREDENTIALS_FIXTURE.readToken,
        lineageToken: MADO_CREDENTIALS_FIXTURE.lineageToken,
      }),
      pluginId: approved.id,
    }));
  });

  it('完了後に登録した出力DatasetVersionもoutboxへ保存し、保存失敗ならバージョンとRunの変更を戻す', async () => {
    const fixture = await executionFixture(harness);
    await entity<PluginConnection>(
      await request(harness.app, `${fixture.basePath}/plugins`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput({ name: 'Lineage' }),
      }),
    );
    const run = await fixture.newRun();
    for (const status of ['running', 'finished'])
      await entity(
        await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
          method: 'PATCH',
          cookie: fixture.editor.cookie,
          body: { status },
        }),
        200,
      );
    const dataset = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { namespace: 'local', name: 'Late predictions' },
      }),
    );
    const versionPath = `${fixture.basePath}/datasets/${dataset.id}/versions`;
    const version = await entity<DatasetVersion>(
      await request(harness.app, versionPath, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version: 'v1',
          uri: 's3://fixture/predictions',
          digest: referenceDigest('fixture'),
          sourceRunId: run.id,
        },
      }),
    );
    const refreshed = await harness.database.query<{ event: PluginEvent }>(
      "SELECT event FROM plugin_outbox WHERE event->'outputDatasets' @> $1::jsonb",
      [JSON.stringify([{ id: version.id }])],
    );
    expect(refreshed.rows).toHaveLength(1);
    expect(refreshed.rows[0]!.event.type).toBe('run.finished');
    expect(refreshed.rows[0]!.event.run.outputDatasetVersionIds).toEqual([version.id]);
    expect(refreshed.rows[0]!.event.outputDatasets[0]?.id).toBe(version.id);
    await harness.database.query(
      "CREATE FUNCTION fail_late_output() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$",
    );
    await harness.database.query(
      'CREATE TRIGGER fail_late_output BEFORE INSERT ON plugin_outbox FOR EACH ROW EXECUTE FUNCTION fail_late_output()',
    );
    try {
      const rejected = await request(harness.app, versionPath, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version: 'v2',
          uri: 's3://fixture/next',
          digest: referenceDigest('next'),
          sourceRunId: run.id,
        },
      });
      expect(rejected.status).toBe(503);
      const stored = await entity<Run>(
        await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
          cookie: fixture.viewer.cookie,
        }),
        200,
      );
      expect(stored.outputDatasetVersionIds).toEqual([version.id]);
      expect(
        (
          await harness.database.query('SELECT id FROM dataset_versions WHERE dataset_id=$1', [
            dataset.id,
          ])
        ).rows,
      ).toHaveLength(1);
    } finally {
      await harness.database.query('DROP TRIGGER fail_late_output ON plugin_outbox');
      await harness.database.query('DROP FUNCTION fail_late_output()');
    }
  });

  it('plugin障害でもRunは完了し、DB outboxから同じeventを再送できる', async () => {
    const fixture = await executionFixture(harness);
    const delivered: string[] = [];
    let isUnavailable = true;
    const client = madoClientStub({
      sendPayload: async (payload) => {
        if (isUnavailable) throw new Error('Unavailable');
        delivered.push(payload);
      },
    });
    const application = createApplication({
      config: harness.config,
      database: harness.database,
      stores: harness.stores,
      pluginClientFactory: () => client,
    });
    const plugin = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput({ name: 'Test plugin' }),
      }),
    );
    expect(
      (
        await request(application.app, `${fixture.basePath}/plugins/${plugin.id}/check`, {
          method: 'POST',
          cookie: fixture.editor.cookie,
        })
      ).status,
    ).toBe(403);
    await entity(
      await request(application.app, `${fixture.basePath}/plugins/${plugin.id}/check`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
      }),
      200,
    );
    const run = await fixture.newRun();
    await entity(
      await request(application.app, `${fixture.basePath}/runs/${run.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { status: 'running' },
      }),
      200,
    );
    await entity(
      await request(application.app, `${fixture.basePath}/runs/${run.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { status: 'finished' },
      }),
      200,
    );
    expect(await application.outbox.dispatchBatch()).toBe(0);
    const stored = await entity<Run>(
      await request(application.app, `${fixture.basePath}/runs/${run.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(stored.status).toBe('finished');
    const pending = await harness.database.query(
      'SELECT event_id,status,attempts,last_error,payload FROM plugin_outbox ORDER BY created_at',
    );
    expect(pending.rows).toHaveLength(2);
    expect(
      pending.rows.every((record) => record.status === 'pending' && record.attempts === 1),
    ).toBe(true);
    isUnavailable = false;
    const retry = await entity<{ queued: number }>(
      await request(application.app, `${fixture.basePath}/plugins/${plugin.id}/events/retry`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
      }),
      200,
    );
    expect(retry.queued).toBe(2);
    const sent = await Promise.all([
      application.outbox.dispatchBatch(),
      application.outbox.dispatchBatch(),
    ]);
    expect(sent.reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(new Set(delivered).size).toBe(2);
    expect(delivered.map((payload) => JSON.parse(payload).eventType).sort()).toEqual(['COMPLETE', 'START']);
    expect(delivered.sort()).toEqual(pending.rows.map((record) => record.payload).sort());
    expect(delivered.every((payload) => JSON.parse(payload).run.runId === run.id)).toBe(true);
  });

  it('outbox保存が失敗したらRun完了とGPU解放もrollbackし、再送完了はeventを重複させない', async () => {
    const fixture = await executionFixture(harness);
    await entity(
      await request(harness.app, `${fixture.basePath}/plugins`, {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: madoPluginInput({ name: 'Atomic plugin' }),
      }),
    );
    const run = await fixture.newRun();
    await entity(
      await request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: run.id, targetId: fixture.target.id, gpuIds: ['0'] },
      }),
    );
    const claimed = (
      await entity<{ item: WorkerJob }>(
        await request(harness.app, '/api/worker/claim', {
          method: 'POST',
          token: fixture.workerToken,
          body: { workerId: 'atomic-worker' },
        }),
        200,
      )
    ).item;
    await harness.database.query(
      "CREATE FUNCTION fail_outbox_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$",
    );
    await harness.database.query(
      'CREATE TRIGGER fail_outbox_insert BEFORE INSERT ON plugin_outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox_insert()',
    );
    const finish = () =>
      request(harness.app, `/api/worker/jobs/${claimed.job.id}/complete`, {
        method: 'POST',
        token: fixture.workerToken,
        body: {
          leaseId: claimed.job.leaseId,
          status: 'finished',
          exitCode: 0,
        },
      });
    try {
      expect((await finish()).status).toBe(503);
      expect(
        (await harness.database.query('SELECT status FROM runs WHERE id=$1', [run.id])).rows[0]
          .status,
      ).toBe('running');
      expect(
        (
          await harness.database.query('SELECT * FROM gpu_reservations WHERE job_id=$1', [
            claimed.job.id,
          ])
        ).rows,
      ).toHaveLength(1);
    } finally {
      await harness.database.query('DROP TRIGGER fail_outbox_insert ON plugin_outbox');
      await harness.database.query('DROP FUNCTION fail_outbox_insert()');
    }
    await entity(await finish(), 200);
    await entity(await finish(), 200);
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM plugin_outbox')).rows[0]
        .count,
    ).toBe(2);
    expect(
      (
        await harness.database.query('SELECT * FROM gpu_reservations WHERE job_id=$1', [
          claimed.job.id,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it('固定Madoバージョンを再取得して並行取り込みを1件にし、変更されたdigestを拒否する', async () => {
    const fixture = await executionFixture(harness);
    const dataset = {
      externalId: randomUUID(), namespace: 'remote', name: 'Corpus', version: 'v1',
      uri: 's3://example/corpus', digest: referenceDigest('original'), schema: {}, metadata: {},
    };
    let externalDataset = dataset;
    const datasetVersion = vi.fn(async (_externalId: string) => externalDataset);
    const application = createApplication({
      config: harness.config, database: harness.database, stores: harness.stores,
      pluginClientFactory: () => madoClientStub({ datasetVersion }),
    });
    const plugin = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST', cookie: fixture.administrator.cookie,
        body: madoPluginInput({ name: 'Import Mado' }),
      }),
    );
    const importDataset = () => request(application.app, `${fixture.basePath}/plugins/${plugin.id}/datasets/import`, {
      method: 'POST', cookie: fixture.administrator.cookie,
      body: { externalId: dataset.externalId, expectedRevision: plugin.configRevision },
    });
    const imports = await Promise.all(
      [importDataset(), importDataset()].map(async (response) => entity<DatasetVersion>(await response)),
    );
    expect(imports[0]!.id).toBe(imports[1]!.id);
    expect(imports[0]!.externalRef?.pluginId).toBe(plugin.id);
    expect(datasetVersion).toHaveBeenCalledWith(dataset.externalId);
    externalDataset = { ...dataset, digest: referenceDigest('changed') };
    expect((await importDataset()).status).toBe(409);
    expect((await harness.database.query('SELECT count(*)::int AS count FROM dataset_versions')).rows[0].count).toBe(1);
  });

  it('容量取得キーを設定したMadoだけmetricsを返し、editorには公開しない', async () => {
    const fixture = await executionFixture(harness);
    const application = createApplication({
      config: harness.config, database: harness.database, stores: harness.stores,
      pluginClientFactory: () => madoClientStub({ metrics: async () => ({ prometheus: 'storage_bytes 12\n' }) }),
    });
    const plugin = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST', cookie: fixture.administrator.cookie,
        body: madoPluginInput({ name: 'Storage', credentials: { ...MADO_CREDENTIALS_FIXTURE, metricsToken: 'fixture-metrics-key' } }),
      }),
    );
    const endpoint = `${fixture.basePath}/plugins/${plugin.id}/metrics`;
    expect((await request(application.app, endpoint, { cookie: fixture.editor.cookie })).status).toBe(403);
    expect(await entity(await request(application.app, endpoint, { cookie: fixture.administrator.cookie }), 200))
      .toEqual({ prometheus: 'storage_bytes 12\n' });
    await entity(
      await request(application.app, `${fixture.basePath}/plugins/${plugin.id}`, {
        method: 'PATCH', cookie: fixture.administrator.cookie,
        body: { credentials: { metricsToken: null }, expectedRevision: plugin.configRevision },
      }), 200,
    );
    expect((await request(application.app, endpoint, { cookie: fixture.administrator.cookie })).status).toBe(422);
  });

  it('opt-in seedは実際のCPU metricsと音声をstore.putで保存し、二回目は重複しない', async () => {
    const options = {
      config: harness.config,
      database: harness.database,
      stores: harness.stores,
    };
    await expect(
      seedDemo({
        ...options,
        config: { ...harness.config, allowSeed: false },
      }),
    ).rejects.toMatchObject({ code: 'seed_disabled' });
    const seeded = await seedDemo(options);
    const repeated = await seedDemo(options);
    expect(repeated).toEqual({
      projectId: seeded.projectId,
      alreadySeeded: true,
    });
    const artifacts = await harness.database.query(
      'SELECT path,size,storage_key,backend FROM artifacts',
    );
    expect(artifacts.rows).toHaveLength(2);
    const wave = artifacts.rows.find((artifact) => artifact.path === 'sample.wav')!;
    expect(Number(wave.size)).toBe(32044);
    const content = await harness.stores.read({
      backend: wave.backend,
      key: wave.storage_key,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of content.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('ascii', 0, 4)).toBe('RIFF');
    const training = await harness.database.query(
      "SELECT latest_metrics,status FROM runs WHERE name='CPU linear regression'",
    );
    expect(training.rows[0].status).toBe('finished');
    expect(training.rows[0].latest_metrics.loss).toBeLessThan(1e-7);
    const qwen = await harness.database.query("SELECT status FROM runs WHERE name LIKE 'Qwen%'");
    expect(qwen.rows.every((run) => run.status === 'queued')).toBe(true);
    expect(
      (
        await harness.database.query(
          'SELECT role FROM project_members WHERE project_id=$1 ORDER BY role',
          [seeded.projectId],
        )
      ).rows.map((member) => member.role),
    ).toEqual(['admin', 'editor', 'viewer']);
  });
});
