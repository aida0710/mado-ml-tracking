import type {
  Dataset,
  DatasetVersion,
  LineageGraph,
  ModelVersion,
  ModelVersionTrainingSource,
  Run,
} from '@mmt/contracts';
import { modelVersionTrainingSourceSchema, runSchema } from '@mmt/contracts/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executionFixture, projectFixture, referenceDigest } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';

describe.skipIf(!testDatabaseUrl)('既存モデル版の学習元（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: Awaited<ReturnType<typeof executionFixture>>;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await executionFixture(harness);
  });
  afterAll(async () => {
    await harness?.close();
  });

  const sourcePath = (version = fixture.modelVersion) =>
    `${fixture.basePath}/models/${version.modelId}/versions/${version.id}/training-source`;

  async function dataset(): Promise<DatasetVersion> {
    const registered = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Synthetic data' },
      }),
    );
    return entity(
      await request(harness.app, `${fixture.basePath}/datasets/${registered.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version: 'verified',
          uri: 's3://test-training-data/manifest.json',
          digest: referenceDigest('verified'),
        },
      }),
    );
  }

  async function completedRun(input: Record<string, unknown> = {}): Promise<Run> {
    const run = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          name: 'Past pretraining',
          experimentId: fixture.experiment.id,
          kind: 'training',
          ...input,
        },
      }),
    );
    return entity(
      await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { status: 'finished' },
      }),
      200,
    );
  }

  async function associate(runId: string, version = fixture.modelVersion) {
    return request(harness.app, sourcePath(version), {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: { runId, evidence: { recipe: 'verified-recipe.json' } },
    });
  }

  it('不変の版とAliasを保ち、Dataset→Run→Modelの正式な辺を追加する', async () => {
    const data = await dataset();
    const run = await completedRun({ inputDatasetVersionIds: [data.id] });
    await entity(
      await request(
        harness.app,
        `${fixture.basePath}/models/${fixture.model.id}/aliases/deployed`,
        {
          method: 'PUT',
          cookie: fixture.editor.cookie,
          body: { versionId: fixture.modelVersion.id },
        },
      ),
      200,
    );
    const before = await harness.database.query('SELECT * FROM model_versions WHERE id=$1', [
      fixture.modelVersion.id,
    ]);
    expect(
      await (await request(harness.app, sourcePath(), { cookie: fixture.viewer.cookie })).json(),
    ).toEqual({ source: null });
    const source = await entity<ModelVersionTrainingSource>(await associate(run.id), 200);
    expect(modelVersionTrainingSourceSchema.parse(source).runId).toBe(run.id);
    expect(source.origin).toBe('association');
    expect(source.evidence).toEqual({ recipe: 'verified-recipe.json' });
    expect(
      (
        await harness.database.query('SELECT * FROM model_versions WHERE id=$1', [
          fixture.modelVersion.id,
        ])
      ).rows,
    ).toEqual(before.rows);
    expect(
      (
        await harness.database.query('SELECT version_id FROM model_aliases WHERE model_id=$1', [
          fixture.model.id,
        ])
      ).rows[0].version_id,
    ).toBe(fixture.modelVersion.id);
    const version = await entity<ModelVersion>(
      await request(
        harness.app,
        `${fixture.basePath}/models/${fixture.model.id}/versions/${fixture.modelVersion.id}`,
        { cookie: fixture.viewer.cookie },
      ),
      200,
    );
    expect(version.sourceRunId).toBeNull();
    expect(version.trainingSourceRunId).toBe(run.id);
    const readRun = runSchema.parse(
      await entity(
        await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
          cookie: fixture.viewer.cookie,
        }),
        200,
      ),
    );
    expect(readRun.outputModelVersionIds).toEqual([fixture.modelVersion.id]);
    const graph = await entity<LineageGraph>(
      await request(harness.app, `${fixture.basePath}/lineage`, { cookie: fixture.viewer.cookie }),
      200,
    );
    expect(graph.edges).toContainEqual({ source: data.id, target: run.id, relation: 'input' });
    expect(graph.edges).toContainEqual({
      source: run.id,
      target: fixture.modelVersion.id,
      relation: 'outputModel',
    });
    expect(
      (
        await harness.database.query(
          "SELECT count(*)::int AS count FROM audit_events WHERE action='model.training_source.associate' AND outcome='success'",
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('過去の学習記録と紐付けを一緒に保存し、未知の学習日時を推測しない', async () => {
    const data = await dataset();
    const body = {
      run: {
        name: 'Imported pretraining',
        kind: 'training',
        experimentId: fixture.experiment.id,
        inputDatasetVersionIds: [data.id],
        tags: { legacyRunId: 'external-run' },
      },
      evidence: { note: 'Recipe confirmed' },
    };
    const eventsBefore = await harness.database.query('SELECT * FROM plugin_outbox');
    const source = await entity<ModelVersionTrainingSource>(
      await request(harness.app, sourcePath(), {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body,
      }),
      200,
    );
    const run = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs/${source.runId}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(run).toMatchObject({
      status: 'finished',
      kind: 'training',
      startedAt: null,
      endedAt: null,
      inputDatasetVersionIds: [data.id],
    });
    expect(run.outputModelVersionIds).toEqual([fixture.modelVersion.id]);
    expect((await harness.database.query('SELECT * FROM plugin_outbox')).rows).toEqual(
      eventsBefore.rows,
    );
    const repeated = await entity<ModelVersionTrainingSource>(
      await request(harness.app, sourcePath(), {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body,
      }),
      200,
    );
    expect(repeated).toEqual(source);
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM runs')).rows[0].count,
    ).toBe(1);
    expect(
      (
        await request(harness.app, sourcePath(), {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { ...body, run: { ...body.run, name: 'Different training' } },
        })
      ).status,
    ).toBe(409);
  });

  it('日時とデータを検証し、紐付けの保存に失敗したら学習記録も残さない', async () => {
    const selfInput = {
      name: 'Wrong history',
      experimentId: fixture.experiment.id,
      kind: 'training',
      modelVersionId: fixture.modelVersion.id,
    };
    expect(
      (
        await request(harness.app, sourcePath(), {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { run: selfInput },
        })
      ).status,
    ).toBe(422);
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM runs')).rows[0].count,
    ).toBe(0);
    expect(
      (
        await request(harness.app, sourcePath(), {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: {
            run: {
              ...selfInput,
              modelVersionId: undefined,
              startedAt: '2026-10-10T12:00:00Z',
              endedAt: '2026-10-09T12:00:00Z',
            },
          },
        })
      ).status,
    ).toBe(422);
    await harness.database
      .query(`CREATE FUNCTION reject_test_training_source() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test storage failure'; END; $$;
      CREATE TRIGGER reject_test_source BEFORE INSERT ON model_version_training_sources FOR EACH ROW EXECUTE FUNCTION reject_test_training_source()`);
    try {
      expect(
        (
          await request(harness.app, sourcePath(), {
            method: 'POST',
            cookie: fixture.editor.cookie,
            body: { run: { ...selfInput, modelVersionId: undefined } },
          })
        ).status,
      ).toBe(503);
      expect(
        (await harness.database.query('SELECT count(*)::int AS count FROM runs')).rows[0].count,
      ).toBe(0);
    } finally {
      await harness.database.query(
        'DROP TRIGGER reject_test_source ON model_version_training_sources; DROP FUNCTION reject_test_training_source()',
      );
    }
  });

  it('同じ学習元の再送は同じ記録を返し、別のRunによる上書きを拒否する', async () => {
    const run = await completedRun();
    const source = await entity<ModelVersionTrainingSource>(await associate(run.id), 200);
    expect(await entity(await associate(run.id), 200)).toEqual(source);
    expect((await associate((await completedRun()).id)).status).toBe(409);
    await expect(
      harness.database.query(
        'UPDATE model_version_training_sources SET evidence=$2 WHERE model_version_id=$1',
        [fixture.modelVersion.id, '{}'],
      ),
    ).rejects.toThrow('append-only');
    await expect(
      harness.database.query(
        'DELETE FROM model_version_training_sources WHERE model_version_id=$1',
        [fixture.modelVersion.id],
      ),
    ).rejects.toThrow('purging');
    await expect(
      harness.database.query('UPDATE model_versions SET source_run_id=$2 WHERE id=$1', [
        fixture.modelVersion.id,
        run.id,
      ]),
    ).rejects.toThrow('immutable');
  });

  it('登録時の学習元は後付けの学習元で置き換えない', async () => {
    const run = await completedRun({ kind: 'finetuning' });
    const version = await entity<ModelVersion>(
      await request(harness.app, `${fixture.basePath}/models/${fixture.model.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { sourceRunId: run.id },
      }),
    );
    expect(
      await entity<ModelVersionTrainingSource>(await associate(run.id, version), 200),
    ).toMatchObject({ runId: run.id, origin: 'registration' });
    expect((await associate((await completedRun()).id, version)).status).toBe(409);
  });

  it('閲覧者、権限不足token、他Projectと未終了・推論Runを拒否する', async () => {
    const run = await completedRun();
    for (const cookie of [fixture.viewer.cookie, fixture.outsider.cookie])
      expect(
        (
          await request(harness.app, sourcePath(), {
            method: 'POST',
            cookie,
            body: { runId: run.id },
          })
        ).status,
      ).toBe(403);
    for (const scopes of [
      ['read', 'registry:write'],
      ['read', 'runs:write'],
    ]) {
      const token = await entity<{ token: string }>(
        await request(harness.app, '/api/tokens', {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { name: 'Restricted', kind: 'personal', projectId: fixture.project.id, scopes },
        }),
      );
      expect(
        (
          await request(harness.app, sourcePath(), {
            method: 'POST',
            token: token.token,
            body: { runId: run.id },
          })
        ).status,
      ).toBe(403);
    }
    expect((await associate((await completedRun({ kind: 'inference' })).id)).status).toBe(422);
    const active = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: 'Not yet trained', experimentId: fixture.experiment.id, kind: 'training' },
      }),
    );
    expect((await associate(active.id)).status).toBe(422);
    const other = await projectFixture(harness);
    const otherRun = await entity<Run>(
      await request(harness.app, `${other.basePath}/runs`, {
        method: 'POST',
        cookie: other.editor.cookie,
        body: { name: 'Other Project', kind: 'training', experimentId: other.experiment.id },
      }),
    );
    expect((await associate(otherRun.id)).status).toBe(404);
  });

  it('祖先モデルを学習出力にしたり、同時登録で循環を作ったりできない', async () => {
    const second = await entity<ModelVersion>(
      await request(harness.app, `${fixture.basePath}/models/${fixture.model.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {},
      }),
    );
    const firstRun = await completedRun({ modelVersionId: second.id });
    const secondRun = await completedRun({ modelVersionId: fixture.modelVersion.id });
    const responses = await Promise.all([associate(firstRun.id), associate(secondRun.id, second)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 422]);
    expect(
      (
        await harness.database.query(
          'SELECT count(*)::int AS count FROM model_version_training_sources',
        )
      ).rows[0].count,
    ).toBe(1);
  });
});
