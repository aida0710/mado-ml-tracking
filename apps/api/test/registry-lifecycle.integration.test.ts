import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Dataset,
  DatasetVersion,
  Experiment,
  Job,
  Model,
  ModelVersion,
  Project,
  Run,
} from '@mmt/contracts';
import type { PoolClient } from 'pg';
import { DomainError } from '../src/domain/errors.js';
import { registerDatasetVersion } from '../src/services/datasetVersionRegistration.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { executionFixture, referenceDigest } from './fixtures.js';

type Fixture = Awaited<ReturnType<typeof executionFixture>>;

// リクエストが待つロックに着くまでにかけてよい時間。リクエストは先にいくつかクエリを実行する。
const LOCK_WAIT_TIMEOUT = 5000;
// 6回の作成が、それぞれ順に削除を待つ。
const SERIALIZATION_TEST_TIMEOUT = 60_000;

describe.skipIf(!testDatabaseUrl)('Registryのライフサイクル（独立PostgreSQL）', () => {
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

  async function patch(
    endpoint: string,
    options: { cookie: string; body: unknown },
  ): Promise<Response> {
    return request(harness.app, endpoint, { method: 'PATCH', ...options });
  }

  async function auditEvents(action: string) {
    return (
      await harness.database.query<{ outcome: string; resource_id: string; details: object }>(
        'SELECT outcome,resource_id,details FROM audit_events WHERE action=$1 ORDER BY occurred_at,id',
        [action],
      )
    ).rows;
  }

  async function datasetWithVersion(fixture: Fixture, name = 'Corpus') {
    const dataset = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name },
      }),
    );
    const version = await entity<DatasetVersion>(
      await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { version: 'v1', uri: `file:///${name}`, digest: referenceDigest(`${name}-v1`) },
      }),
    );
    return { dataset, version };
  }

  function runWithInputs(fixture: Fixture, inputDatasetVersionIds: string[]) {
    return request(harness.app, `${fixture.basePath}/runs`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        experimentId: fixture.experiment.id,
        name: 'Fine tuning',
        kind: 'finetuning',
        modelVersionId: fixture.modelVersion.id,
        inputDatasetVersionIds,
      },
    });
  }

  // fixtureのeditorからは見えず、同じ種類のものを持つProject。
  async function otherProject(fixture: Fixture) {
    const project = await entity<Project>(
      await request(harness.app, '/api/projects', {
        method: 'POST',
        cookie: fixture.administrator.cookie,
        body: { name: 'Other Project' },
      }),
    );
    const basePath = `/api/projects/${project.id}`;
    const cookie = fixture.administrator.cookie;
    const model = await entity<Model>(
      await request(harness.app, `${basePath}/models`, {
        method: 'POST',
        cookie,
        body: { name: 'Other Model', family: 'qwen2' },
      }),
    );
    const version = await entity<ModelVersion>(
      await request(harness.app, `${basePath}/models/${model.id}/versions`, {
        method: 'POST',
        cookie,
        body: { version: 'other' },
      }),
    );
    const experiment = await entity<Experiment>(
      await request(harness.app, `${basePath}/experiments`, {
        method: 'POST',
        cookie,
        body: { name: 'Other Experiment' },
      }),
    );
    const dataset = await entity<Dataset>(
      await request(harness.app, `${basePath}/datasets`, {
        method: 'POST',
        cookie,
        body: { name: 'Other Corpus' },
      }),
    );
    return { model, version, experiment, dataset };
  }

  it('editorはModelの説明を変えられ、単体取得とネストしたバージョンの取得に反映され、監査に残る', async () => {
    const fixture = await executionFixture(harness);
    const updated = await entity<Model>(
      await patch(`${fixture.basePath}/models/${fixture.model.id}`, {
        cookie: fixture.editor.cookie,
        body: { description: '社内コーパスで学習した系列' },
      }),
      200,
    );
    expect(updated).toMatchObject({
      id: fixture.model.id,
      name: fixture.model.name,
      family: 'qwen2',
      description: '社内コーパスで学習した系列',
      latestVersion: 'base',
    });
    const fetched = await entity<Model>(
      await request(harness.app, `${fixture.basePath}/models/${fixture.model.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(fetched).toEqual(updated);
    const version = await entity<ModelVersion>(
      await request(
        harness.app,
        `${fixture.basePath}/models/${fixture.model.id}/versions/${fixture.modelVersion.id}`,
        { cookie: fixture.viewer.cookie },
      ),
      200,
    );
    expect(version).toEqual(fixture.modelVersion);
    expect(await auditEvents('model.update')).toEqual([
      {
        outcome: 'success',
        resource_id: fixture.model.id,
        details: { fields: ['description'] },
      },
    ]);
  });

  it('名前・系列の変更や空のbodyは422で、Modelは変わらない', async () => {
    const fixture = await executionFixture(harness);
    for (const body of [{}, { name: 'Renamed' }, { family: 'llama' }]) {
      const response = await patch(`${fixture.basePath}/models/${fixture.model.id}`, {
        cookie: fixture.editor.cookie,
        body,
      });
      expect(response.status).toBe(422);
    }
    const fetched = await entity<Model>(
      await request(harness.app, `${fixture.basePath}/models/${fixture.model.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(fetched).toMatchObject({ name: fixture.model.name, family: 'qwen2', description: '' });
  });

  it('viewerの変更は403で監査にdeniedが残り、値は変わらない', async () => {
    const fixture = await executionFixture(harness);
    const { dataset } = await datasetWithVersion(fixture);
    const attempts = [
      [`${fixture.basePath}/models/${fixture.model.id}`, { description: 'x' }],
      [`${fixture.basePath}/experiments/${fixture.experiment.id}`, { name: 'x' }],
      [`${fixture.basePath}/datasets/${dataset.id}`, { archived: true }],
    ] as const;
    for (const [endpoint, body] of attempts)
      expect((await patch(endpoint, { cookie: fixture.viewer.cookie, body })).status).toBe(403);
    for (const action of ['model.update', 'experiment.update', 'dataset.update'])
      expect((await auditEvents(action)).map((event) => event.outcome)).toEqual(['denied']);
    const stored = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(stored.archivedAt).toBeNull();
  });

  it('Experimentの名前と説明を変えられ、Project内の重複は409、別Projectの同名は許す', async () => {
    const fixture = await executionFixture(harness);
    const other = await otherProject(fixture);
    const second = await entity<Experiment>(
      await request(harness.app, `${fixture.basePath}/experiments`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Second Experiment' },
      }),
    );
    const duplicate = await patch(`${fixture.basePath}/experiments/${second.id}`, {
      cookie: fixture.editor.cookie,
      body: { name: fixture.experiment.name },
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: 'already_exists' });

    await fixture.newRun();
    const renamed = await entity<Experiment>(
      await patch(`${fixture.basePath}/experiments/${fixture.experiment.id}`, {
        cookie: fixture.editor.cookie,
        body: { name: other.experiment.name, description: '評価用' },
      }),
      200,
    );
    expect(renamed).toMatchObject({
      id: fixture.experiment.id,
      name: 'Other Experiment',
      description: '評価用',
      runCount: 1,
    });
    // 今の名前をもう一度送っても、自分自身との競合にはならない。
    await entity(
      await patch(`${fixture.basePath}/experiments/${fixture.experiment.id}`, {
        cookie: fixture.editor.cookie,
        body: { name: 'Other Experiment' },
      }),
      200,
    );
    const fetched = await entity<Experiment>(
      await request(harness.app, `${fixture.basePath}/experiments/${fixture.experiment.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(fetched).toMatchObject({ name: 'Other Experiment', description: '評価用' });
    const events = await auditEvents('experiment.update');
    expect(events.map((event) => event.outcome)).toEqual(['denied', 'success', 'success']);
    expect(events[1]!.details).toEqual({
      fields: ['name', 'description'],
      name: 'Other Experiment',
      previousName: 'Test Experiment',
    });
  });

  it('MLflowで削除したExperimentは取得が404、変更が409', async () => {
    const fixture = await executionFixture(harness);
    await harness.database.query(
      "UPDATE experiments SET lifecycle_stage='deleted' WHERE id=$1",
      [fixture.experiment.id],
    );
    expect(
      (
        await request(harness.app, `${fixture.basePath}/experiments/${fixture.experiment.id}`, {
          cookie: fixture.viewer.cookie,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await patch(`${fixture.basePath}/experiments/${fixture.experiment.id}`, {
          cookie: fixture.editor.cookie,
          body: { description: 'x' },
        })
      ).status,
    ).toBe(409);
  });

  it('archiveしたDatasetのバージョンは新しいRunの入力で422になり、既存Runの参照とJob作成は残る', async () => {
    const fixture = await executionFixture(harness);
    const { dataset, version } = await datasetWithVersion(fixture);
    const existing = await entity<Run>(await runWithInputs(fixture, [version.id]));

    const archived = await entity<Dataset>(
      await patch(`${fixture.basePath}/datasets/${dataset.id}`, {
        cookie: fixture.editor.cookie,
        body: { archived: true },
      }),
      200,
    );
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.latestVersion).toBe('v1');

    const refused = await runWithInputs(fixture, [version.id]);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ code: 'dataset_archived' });

    const kept = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs/${existing.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(kept.inputDatasetVersionIds).toEqual([version.id]);
    const job = await entity<Job>(
      await request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: existing.id, targetId: fixture.target.id, gpuIds: ['0'] },
      }),
    );
    expect(job.runId).toBe(existing.id);
    // バージョン自体は変わらず、読み取りもできる。
    const versions = await entity<{ items: DatasetVersion[] }>(
      await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(versions.items).toEqual([version]);
  });

  it('archiveを繰り返しても最初の日時のまま、解除すると再び新しいRunの入力に使える', async () => {
    const fixture = await executionFixture(harness);
    const { dataset, version } = await datasetWithVersion(fixture);
    const first = await entity<Dataset>(
      await patch(`${fixture.basePath}/datasets/${dataset.id}`, {
        cookie: fixture.editor.cookie,
        body: { archived: true },
      }),
      200,
    );
    const again = await entity<Dataset>(
      await patch(`${fixture.basePath}/datasets/${dataset.id}`, {
        cookie: fixture.editor.cookie,
        body: { archived: true, description: '旧コーパス' },
      }),
      200,
    );
    expect(again.archivedAt).toBe(first.archivedAt);
    expect(again.description).toBe('旧コーパス');

    const restored = await entity<Dataset>(
      await patch(`${fixture.basePath}/datasets/${dataset.id}`, {
        cookie: fixture.editor.cookie,
        body: { archived: false },
      }),
      200,
    );
    expect(restored.archivedAt).toBeNull();
    await entity<Run>(await runWithInputs(fixture, [version.id]));
    expect((await auditEvents('dataset.update')).map((event) => event.details)).toEqual([
      { fields: ['archived'], archived: true },
      { fields: ['archived', 'description'], archived: true },
      { fields: ['archived'], archived: false },
    ]);
  });

  it('Dataset一覧はarchivedで絞り込め、省略すると全件を返し、知らない条件は422', async () => {
    const fixture = await executionFixture(harness);
    const active = await datasetWithVersion(fixture, 'Active');
    const old = await datasetWithVersion(fixture, 'Old');
    await entity(
      await patch(`${fixture.basePath}/datasets/${old.dataset.id}`, {
        cookie: fixture.editor.cookie,
        body: { archived: true },
      }),
      200,
    );
    async function names(query: string) {
      const page = await entity<{ items: Dataset[] }>(
        await request(harness.app, `${fixture.basePath}/datasets${query}`, {
          cookie: fixture.viewer.cookie,
        }),
        200,
      );
      return page.items.map((dataset) => dataset.name).sort();
    }
    expect(await names('')).toEqual(['Active', 'Old']);
    expect(await names('?archived=false')).toEqual([active.dataset.name]);
    expect(await names('?archived=true')).toEqual([old.dataset.name]);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/datasets?archived=yes`, {
          cookie: fixture.viewer.cookie,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/datasets?archive=true`, {
          cookie: fixture.viewer.cookie,
        })
      ).status,
    ).toBe(422);
  });

  it('archive済みDatasetのバージョンを使うJobのretryは新しいRunを作るので422', async () => {
    const fixture = await executionFixture(harness);
    const { dataset, version } = await datasetWithVersion(fixture);
    const run = await entity<Run>(await runWithInputs(fixture, [version.id]));
    const job = await entity<Job>(
      await request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: run.id, targetId: fixture.target.id, gpuIds: ['0'] },
      }),
    );
    await harness.database.query("UPDATE jobs SET status='failed' WHERE id=$1", [job.id]);
    await harness.database.query("UPDATE runs SET status='failed' WHERE id=$1", [run.id]);
    await entity(
      await patch(`${fixture.basePath}/datasets/${dataset.id}`, {
        cookie: fixture.editor.cookie,
        body: { archived: true },
      }),
      200,
    );
    const retry = await request(harness.app, `${fixture.basePath}/jobs/${job.id}/retry`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
    });
    expect(retry.status).toBe(422);
    expect(await retry.json()).toMatchObject({ code: 'dataset_archived' });
  });

  it('参照のバージョンのdigestは64桁の小文字16進数を、sha256:付きでも省いても受け付け、渡された形のまま保存する', async () => {
    const fixture = await executionFixture(harness);
    const { dataset } = await datasetWithVersion(fixture);
    const createVersion = (version: string, digest: string) =>
      request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { version, uri: 's3://bucket/corpus/', digest },
      });
    const prefixed = referenceDigest('corpus-v2');
    const bare = referenceDigest('corpus-v3').slice('sha256:'.length);
    expect(await entity<DatasetVersion>(await createVersion('v2', prefixed))).toMatchObject({
      digest: prefixed,
    });
    // workerはどちらの形も検査する。前置きの無い形は前置きを付けずに保存するので、同じバージョンを
    // もう一度登録するときは、SDKが送った文字列で比べる。
    expect(await entity<DatasetVersion>(await createVersion('v3', bare))).toMatchObject({
      digest: bare,
    });
  });

  it('参照のバージョンのdigestが大文字・短い・別の算法なら422 dataset_digest_invalid', async () => {
    const fixture = await executionFixture(harness);
    const { dataset } = await datasetWithVersion(fixture);
    const valid = referenceDigest('corpus-v2');
    const hex = valid.slice('sha256:'.length);
    const refusedDigests = [
      'abc123',
      valid.toUpperCase(),
      `sha256:${hex.toUpperCase()}`,
      hex.toUpperCase(),
      `sha256:${hex.slice(1)}`,
      hex.slice(1),
      `${valid}0`,
      `sha512:${hex}`,
      `md5:${hex.slice(0, 32)}`,
      `sha256:sha256:${hex}`,
    ];
    for (const digest of refusedDigests) {
      const refused = await request(
        harness.app,
        `${fixture.basePath}/datasets/${dataset.id}/versions`,
        {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { version: 'v2', uri: 's3://bucket/corpus/', digest },
        },
      );
      expect(refused.status, digest).toBe(422);
      expect(await refused.json()).toMatchObject({
        code: 'dataset_digest_invalid',
        error: expect.stringContaining('sha256:<64 lowercase hex digits>'),
      });
    }
  });

  it('どこからも使われていないバージョンだけを削除でき、使われていれば何が使っているかを409で返す', async () => {
    const fixture = await executionFixture(harness);
    const { dataset, version: parent } = await datasetWithVersion(fixture);
    const versionsPath = `${fixture.basePath}/datasets/${dataset.id}/versions`;
    const createVersion = (version: string, parentDatasetVersionIds: string[] = []) =>
      request(harness.app, versionsPath, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version,
          uri: `file:///corpus/${version}`,
          digest: referenceDigest(version),
          parentDatasetVersionIds,
        },
      }).then((response) => entity<DatasetVersion>(response));
    const child = await createVersion('v2', [parent.id]);
    const mistyped = await createVersion('v3-typo');
    const deleteVersion = (versionId: string, cookie = fixture.editor.cookie) =>
      request(harness.app, `${versionsPath}/${versionId}`, { method: 'DELETE', cookie });

    const parentRefusal = await deleteVersion(parent.id);
    expect(parentRefusal.status).toBe(409);
    expect(await parentRefusal.json()).toMatchObject({
      code: 'dataset_version_in_use',
      usages: { childVersion: 1 },
    });
    await entity<Run>(await runWithInputs(fixture, [child.id]));
    const inputRefusal = await deleteVersion(child.id);
    expect(inputRefusal.status).toBe(409);
    expect(await inputRefusal.json()).toMatchObject({ usages: { runInput: 1 } });

    expect((await deleteVersion(mistyped.id, fixture.viewer.cookie)).status).toBe(403);
    expect((await deleteVersion(mistyped.id)).status).toBe(204);
    expect((await deleteVersion(mistyped.id)).status).toBe(404);
    const remaining = await entity<{ items: DatasetVersion[] }>(
      await request(harness.app, versionsPath, { cookie: fixture.viewer.cookie }),
      200,
    );
    expect(remaining.items.map((version) => version.version).sort()).toEqual(['v1', 'v2']);
    const deletionEvents = await auditEvents('dataset.version.delete');
    expect(deletionEvents.map((event) => event.outcome)).toEqual([
      'denied',
      'denied',
      'denied',
      'success',
    ]);
    // 監査ログは後から消せないので、URIは残さない（署名付きのクエリを含むことがある）。
    expect(deletionEvents.at(-1)!.details).toEqual({
      datasetId: dataset.id,
      version: 'v3-typo',
      digest: mistyped.digest,
    });
  });

  // session `holderPid`が持つロックを待っているsession。
  async function sessionsWaitingFor(holderPid: number): Promise<number[]> {
    const waiting = await harness.database.query<{ pid: number }>(
      'SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',
      [holderPid],
    );
    return waiting.rows.map((row) => row.pid);
  }

  async function backendPid(connection: PoolClient): Promise<number> {
    return (await connection.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
  }

  it('Datasetをlockした作成が先なら、同じバージョンの削除はcommitを待ち、作られた参照を数えて409', async () => {
    const fixture = await executionFixture(harness);
    const { dataset, version: parent } = await datasetWithVersion(fixture);
    const { dataset: derived } = await datasetWithVersion(fixture, 'Derived');
    const registration = await harness.database.connect();
    try {
      await registration.query('BEGIN');
      await registerDatasetVersion(registration, {
        projectId: fixture.project.id,
        datasetId: derived.id,
        version: 'from-corpus',
        uri: 'file:///derived/from-corpus',
        digest: referenceDigest('from-corpus'),
        schema: {},
        metadata: {},
        parentDatasetVersionIds: [parent.id],
        actor: { type: 'callerAuthorized' },
      });
      const registrationPid = await backendPid(registration);
      let isDeletionDone = false;
      const deletion = request(
        harness.app,
        `${fixture.basePath}/datasets/${dataset.id}/versions/${parent.id}`,
        { method: 'DELETE', cookie: fixture.editor.cookie },
      ).finally(() => {
        isDeletionDone = true;
      });
      await vi.waitFor(
        async () => expect(await sessionsWaitingFor(registrationPid)).toHaveLength(1),
        LOCK_WAIT_TIMEOUT,
      );
      expect(isDeletionDone).toBe(false);
      await registration.query('COMMIT');
      const refused = await deletion;
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ usages: { childVersion: 1 } });
    } finally {
      await registration.query('ROLLBACK').catch(() => undefined);
      registration.release();
    }
  });

  it(
    '削除が先にDatasetをlockしていれば、そのバージョンを参照する作成は削除のcommitを待って404',
    { timeout: SERIALIZATION_TEST_TIMEOUT },
    async () => {
      const fixture = await executionFixture(harness);
      const versionsOf = (datasetId: string) =>
        `${fixture.basePath}/datasets/${datasetId}/versions`;
      const post = (path: string, cookie: string, body: Record<string, unknown>) =>
        request(harness.app, path, { method: 'POST', cookie, body });
      const runTemplate = {
        experimentId: fixture.experiment.id,
        kind: 'inference',
        codeVersionId: fixture.codeVersion.id,
        modelVersionId: fixture.modelVersion.id,
        targetId: fixture.target.id,
      };
      const { dataset: derived } = await datasetWithVersion(fixture, 'Derived');
      // APIが番号を振るのはArtifactの中身のバージョンだけで、それにはアップロードしたファイルが
      // 要る。uriで同じ登録をして、番号付けのロックが親のロックと一緒に取られることを示す。
      async function registerNumberedChild(parentId: string): Promise<Response> {
        const registration = await harness.database.connect();
        try {
          await registration.query('BEGIN');
          await registerDatasetVersion(registration, {
            projectId: fixture.project.id,
            datasetId: derived.id,
            uri: 'file:///derived/numbered',
            digest: referenceDigest('numbered-child'),
            schema: {},
            metadata: {},
            parentDatasetVersionIds: [parentId],
            actor: { type: 'callerAuthorized' },
          });
          await registration.query('COMMIT');
          return Response.json({}, { status: 201 });
        } catch (error) {
          await registration.query('ROLLBACK');
          if (!(error instanceof DomainError)) throw error;
          return Response.json({ code: error.code }, { status: error.status });
        } finally {
          registration.release();
        }
      }
      // どれも、それぞれのやり方で`versionId`への参照を保存する。
      const creations: Record<string, (versionId: string) => Promise<Response>> = {
        Run: (versionId) => runWithInputs(fixture, [versionId]),
        Task: (versionId) =>
          post(`${fixture.basePath}/tasks`, fixture.editor.cookie, {
            ...runTemplate,
            name: 'Inference task',
            inputDatasetVersionIds: [versionId],
          }),
        自動実行ルール: (versionId) =>
          post(`${fixture.basePath}/automation-rules`, fixture.administrator.cookie, {
            name: 'Automatic inference',
            modelFamilies: ['qwen2'],
            kind: 'inference',
            experimentId: fixture.experiment.id,
            codeVersionId: fixture.codeVersion.id,
            targetId: fixture.target.id,
            inputDatasetVersionIds: [versionId],
          }),
        フック: (versionId) =>
          post(`${fixture.basePath}/hooks`, fixture.editor.cookie, {
            name: 'Manual hook',
            trigger: 'manual',
            template: { ...runTemplate, inputDatasetVersionIds: [versionId] },
          }),
        名前を付けた子バージョン: (versionId) =>
          post(versionsOf(derived.id), fixture.editor.cookie, {
            version: 'named-child',
            uri: 'file:///derived/named',
            digest: referenceDigest('named-child'),
            parentDatasetVersionIds: [versionId],
          }),
        番号を振る子バージョン: registerNumberedChild,
      };
      for (const [label, create] of Object.entries(creations)) {
        const { dataset, version } = await datasetWithVersion(fixture, `Corpus for ${label}`);
        // バージョンの行を押さえておくと、削除はDatasetをロックしたところで止まる。
        const versionHolder = await harness.database.connect();
        try {
          await versionHolder.query('BEGIN');
          await versionHolder.query('SELECT 1 FROM dataset_versions WHERE id=$1 FOR KEY SHARE', [
            version.id,
          ]);
          const deletion = request(harness.app, `${versionsOf(dataset.id)}/${version.id}`, {
            method: 'DELETE',
            cookie: fixture.editor.cookie,
          });
          const holderPid = await backendPid(versionHolder);
          let deletionPid: number | undefined;
          await vi.waitFor(async () => {
            deletionPid = (await sessionsWaitingFor(holderPid))[0];
            expect(deletionPid).toBeDefined();
          }, LOCK_WAIT_TIMEOUT);
          const creation = create(version.id);
          await vi.waitFor(
            async () => expect(await sessionsWaitingFor(deletionPid!), label).toHaveLength(1),
            LOCK_WAIT_TIMEOUT,
          );
          await versionHolder.query('COMMIT');
          expect((await deletion).status, label).toBe(204);
          const refused = await creation;
          expect(refused.status, label).toBe(404);
          expect(await refused.json(), label).toMatchObject({ code: 'not_found' });
        } finally {
          await versionHolder.query('ROLLBACK').catch(() => undefined);
          versionHolder.release();
        }
      }
    },
  );

  it('他ProjectのModel・バージョン・Experiment・DatasetのIDは404', async () => {
    const fixture = await executionFixture(harness);
    const other = await otherProject(fixture);
    const { cookie } = fixture.editor;
    const reads = [
      `${fixture.basePath}/models/${other.model.id}`,
      `${fixture.basePath}/models/${other.model.id}/versions/${other.version.id}`,
      // 同じProjectの別のModelのバージョンも、このModelの下では見つからない。
      `${fixture.basePath}/models/${fixture.model.id}/versions/${other.version.id}`,
      `${fixture.basePath}/experiments/${other.experiment.id}`,
      `${fixture.basePath}/datasets/${other.dataset.id}`,
    ];
    for (const endpoint of reads)
      expect((await request(harness.app, endpoint, { cookie })).status).toBe(404);
    const writes = [
      [`${fixture.basePath}/models/${other.model.id}`, { description: 'x' }],
      [`${fixture.basePath}/experiments/${other.experiment.id}`, { name: 'x' }],
      [`${fixture.basePath}/datasets/${other.dataset.id}`, { archived: true }],
    ] as const;
    for (const [endpoint, body] of writes)
      expect((await patch(endpoint, { cookie, body })).status).toBe(404);
    const untouched = await harness.database.query(
      'SELECT archived_at FROM datasets WHERE id=$1',
      [other.dataset.id],
    );
    expect(untouched.rows[0]).toEqual({ archived_at: null });
  });

  it('同じProjectでも別Modelのバージョンはネストした取得で404', async () => {
    const fixture = await executionFixture(harness);
    const sibling = await entity<Model>(
      await request(harness.app, `${fixture.basePath}/models`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Sibling', family: 'qwen2' },
      }),
    );
    const response = await request(
      harness.app,
      `${fixture.basePath}/models/${sibling.id}/versions/${fixture.modelVersion.id}`,
      { cookie: fixture.viewer.cookie },
    );
    expect(response.status).toBe(404);
  });
});
