import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Artifact,
  Dataset,
  DatasetVersion,
  Run,
} from '@mmt/contracts';
import type { ArtifactStores } from '@mmt/platform';
import { createApplication } from '../src/app.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { executionFixture, referenceDigest } from './fixtures.js';
import { seedDemo } from '../src/seed/demoSeed.js';

describe.skipIf(!testDatabaseUrl)('Artifactの保存の認可（独立PostgreSQL）', () => {
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

  it('完了後に登録した出力DatasetVersionも、Runの出力に並ぶ', async () => {
    const fixture = await executionFixture(harness);
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
    const stored = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(stored.outputDatasetVersionIds).toEqual([version.id]);
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
