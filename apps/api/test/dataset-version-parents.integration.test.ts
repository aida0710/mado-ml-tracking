import type {
  Dataset,
  DatasetVersion,
  DatasetVersionParentPage,
  LineageGraph,
  Run,
} from '@mmt/contracts';
import { datasetVersionParentPageSchema } from '@mmt/contracts/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executionFixture, projectFixture, referenceDigest } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';

describe.skipIf(!testDatabaseUrl)('既存データ版の親追記（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: Awaited<ReturnType<typeof executionFixture>>;
  let audio: DatasetVersion;
  let features: DatasetVersion;
  let style: DatasetVersion;
  const proof = {
    recipe: 's3://verified/recipe.json',
    archiveCount: 32,
    comparison: 'sha256-and-bytes',
  };
  const reason = '保存済みの加工教師音声と特徴量の生成設定を照合し、欠けた親を補足';
  beforeAll(async () => {
    harness = await createHarness();
  });
  afterAll(async () => {
    await harness?.close();
  });
  async function createVersion(name: string, parents: string[] = [], sourceRunId?: string) {
    const dataset = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name },
      }),
    );
    return entity<DatasetVersion>(
      await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version: 'v1',
          uri: `s3://verified/${name}/manifest.json`,
          digest: referenceDigest(name),
          parentDatasetVersionIds: parents,
          ...(sourceRunId ? { sourceRunId } : {}),
        },
      }),
    );
  }
  beforeEach(async () => {
    await harness.reset();
    fixture = await executionFixture(harness);
    audio = await createVersion('processed-audio');
    features = await createVersion('features-unfiltered');
    style = await createVersion('features-style', [features.id]);
  });
  const versionPath = (version: DatasetVersion) =>
    `${fixture.basePath}/datasets/${version.datasetId}/versions/${version.id}`;
  const append = (version = features, parents = [audio.id], cookie = fixture.editor.cookie) =>
    request(harness.app, `${versionPath(version)}/parents`, {
      method: 'POST',
      cookie,
      body: { parentDatasetVersionIds: parents, reason, evidence: proof },
    });

  it('同じ版と12学習入力を保ち、加工音声から特徴量・学習・モデルへ来歴をつなぐ', async () => {
    const runs: Run[] = [];
    for (let index = 0; index < 12; index++) {
      const run = await entity<Run>(
        await request(harness.app, `${fixture.basePath}/runs`, {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: {
            name: `Training ${index}`,
            experimentId: fixture.experiment.id,
            kind: 'training',
            inputDatasetVersionIds: [style.id],
            codeVersionId: fixture.codeVersion.id,
          },
        }),
      );
      runs.push(
        await entity<Run>(
          await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
            method: 'PATCH',
            cookie: fixture.editor.cookie,
            body: { status: 'finished' },
          }),
          200,
        ),
      );
    }
    await entity(
      await request(
        harness.app,
        `${fixture.basePath}/models/${fixture.model.id}/versions/${fixture.modelVersion.id}/training-source`,
        {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { runId: runs[0]!.id },
        },
      ),
      200,
    );
    const runSnapshots = await Promise.all(
      runs.map(async (run) =>
        entity<Run>(
          await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
            cookie: fixture.editor.cookie,
          }),
          200,
        ),
      ),
    );
    const original = (
      await harness.database.query('SELECT * FROM dataset_versions WHERE id=$1', [features.id])
    ).rows[0];
    const history = datasetVersionParentPageSchema.parse(
      await entity<DatasetVersionParentPage>(await append(), 200),
    );
    expect(history.registeredParentDatasetVersionIds).toEqual([]);
    expect(history.parentDatasetVersionIds).toEqual([audio.id]);
    expect(history.items[0]).toMatchObject({
      parentDatasetVersionId: audio.id,
      reason,
      evidence: proof,
      createdBy: fixture.editor.userId,
    });
    expect(history.items[0]!.createdByName).toBeTruthy();
    expect(history.items[0]!.createdAt).toBeTruthy();
    const listing = await entity<{ items: DatasetVersion[] }>(
      await request(harness.app, `${fixture.basePath}/datasets/${features.datasetId}/versions`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    const read = listing.items.find((version) => version.id === features.id);
    expect(read).toEqual({ ...features, parentDatasetVersionIds: [audio.id] });
    expect(
      (await harness.database.query('SELECT * FROM dataset_versions WHERE id=$1', [features.id]))
        .rows[0],
    ).toEqual(original);
    const graph = await entity<LineageGraph>(
      await request(harness.app, `${fixture.basePath}/lineage`, { cookie: fixture.viewer.cookie }),
      200,
    );
    expect(graph.edges).toContainEqual({
      source: audio.id,
      target: features.id,
      relation: 'parentDataset',
    });
    expect(graph.edges).toContainEqual({
      source: features.id,
      target: style.id,
      relation: 'parentDataset',
    });
    for (const [index, run] of runs.entries()) {
      expect(graph.edges).toContainEqual({ source: style.id, target: run.id, relation: 'input' });
      expect(
        await entity(
          await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
            cookie: fixture.editor.cookie,
          }),
          200,
        ),
      ).toEqual(runSnapshots[index]);
      expect(
        await entity(
          await request(harness.app, `${fixture.basePath}/runs/${run.id}/training-data-stages`, {
            cookie: fixture.editor.cookie,
          }),
          200,
        ),
      ).toMatchObject({ items: [] });
    }
    expect(graph.edges).toContainEqual({
      source: runs[0]!.id,
      target: fixture.modelVersion.id,
      relation: 'outputModel',
    });
    const events = await harness.database.query(
      "SELECT actor_user_id,details FROM audit_events WHERE action='dataset.version.parents.append' AND outcome='success'",
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].actor_user_id).toBe(fixture.editor.userId);
    expect(JSON.stringify(events.rows[0].details)).not.toContain(proof.recipe);
  });

  it('再送と同時追記で履歴を増やさず、追加時の人・理由・根拠を保持する', async () => {
    const pages = await Promise.all(
      (await Promise.all([append(), append()])).map((response) =>
        entity<DatasetVersionParentPage>(response, 200),
      ),
    );
    expect(pages[0]).toEqual(pages[1]);
    const repeat = await entity<DatasetVersionParentPage>(
      await request(
        harness.app,
        `${fixture.basePath}/datasets/${features.datasetId.toUpperCase()}/versions/${features.id.toUpperCase()}/parents`,
        {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: {
            parentDatasetVersionIds: [audio.id.toUpperCase()],
            reason: '別の理由',
            evidence: { another: true },
          },
        },
      ),
      200,
    );
    expect(repeat).toEqual(pages[0]);
    expect(
      (
        await harness.database.query(
          'SELECT count(*)::int AS count FROM dataset_version_parent_additions',
        )
      ).rows[0].count,
    ).toBe(1);
    const native = await entity<DatasetVersionParentPage>(
      await request(harness.app, `${versionPath(style)}/parents`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { parentDatasetVersionIds: [features.id], reason, evidence: proof },
      }),
      200,
    );
    expect(native.items).toEqual([]);
    expect(native.registeredParentDatasetVersionIds).toEqual([features.id]);
    await expect(
      harness.database.query('UPDATE dataset_version_parent_additions SET reason=$1', [
        'replacement',
      ]),
    ).rejects.toThrow('append-only');
    await expect(
      harness.database.query('DELETE FROM dataset_version_parent_additions'),
    ).rejects.toThrow('purging');
  });

  it('自己・登録済みの子・追記した子と同時逆向き追記の循環を拒否する', async () => {
    expect((await append(features, [features.id])).status).toBe(422);
    expect((await append(features, [style.id])).status).toBe(422);
    await entity(await append(), 200);
    expect((await append(audio, [features.id])).status).toBe(422);
    const left = await createVersion('left');
    const right = await createVersion('right');
    const attempts = await Promise.all([append(left, [right.id]), append(right, [left.id])]);
    expect(attempts.map((response) => response.status).sort()).toEqual([200, 422]);
  });

  it('Runの出力から入力版へ戻す循環も拒否する', async () => {
    const processing = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          name: 'Processing',
          kind: 'processing',
          experimentId: fixture.experiment.id,
          inputDatasetVersionIds: [features.id],
        },
      }),
    );
    const output = await createVersion('processing-output', [], processing.id);
    expect((await append(features, [output.id])).status).toBe(422);
  });

  it('閲覧者・権限不足token・別Project・空の根拠や不正な親を拒否する', async () => {
    expect((await append(features, [audio.id], fixture.viewer.cookie)).status).toBe(403);
    expect(
      (
        await request(harness.app, `${versionPath(features)}/parents`, {
          cookie: fixture.viewer.cookie,
        })
      ).status,
    ).toBe(200);
    const token = await entity<{ token: string }>(
      await request(harness.app, '/api/tokens', {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          name: 'Read only',
          projectId: fixture.project.id,
          scopes: ['read'],
        },
      }),
    );
    expect(
      (
        await request(harness.app, `${versionPath(features)}/parents`, {
          method: 'POST',
          token: token.token,
          body: { parentDatasetVersionIds: [audio.id], reason, evidence: proof },
        })
      ).status,
    ).toBe(403);
    for (const body of [
      { parentDatasetVersionIds: [], reason, evidence: proof },
      { parentDatasetVersionIds: [audio.id, audio.id.toUpperCase()], reason, evidence: proof },
      { parentDatasetVersionIds: [audio.id], reason: '', evidence: proof },
      { parentDatasetVersionIds: [audio.id], reason, evidence: {} },
      { parentDatasetVersionIds: [audio.id], reason, evidence: { payload: 'x'.repeat(70 * 1024) } },
    ])
      expect(
        (
          await request(harness.app, `${versionPath(features)}/parents`, {
            method: 'POST',
            cookie: fixture.editor.cookie,
            body,
          })
        ).status,
      ).toBe(422);
    const other = await projectFixture(harness);
    const otherDataset = await entity<Dataset>(
      await request(harness.app, `${other.basePath}/datasets`, {
        method: 'POST',
        cookie: other.editor.cookie,
        body: { name: 'Other' },
      }),
    );
    const otherVersion = await entity<DatasetVersion>(
      await request(harness.app, `${other.basePath}/datasets/${otherDataset.id}/versions`, {
        method: 'POST',
        cookie: other.editor.cookie,
        body: { version: 'v1', uri: 's3://other/data.json', digest: referenceDigest('other') },
      }),
    );
    expect((await append(features, [audio.id, otherVersion.id])).status).toBe(404);
    expect(
      (
        await harness.database.query(
          'SELECT count(*)::int AS count FROM dataset_version_parent_additions',
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it('追加した親と訂正履歴のある版の削除を使用中として拒否する', async () => {
    await entity(await append(), 200);
    const independent = await createVersion('corrected-without-descendants');
    await entity(await append(independent, [audio.id]), 200);
    for (const version of [audio, features, independent]) {
      const response = await request(harness.app, versionPath(version), {
        method: 'DELETE',
        cookie: fixture.editor.cookie,
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'dataset_version_in_use' });
    }
  });

  it('親の削除と追記が競合しても、成功した参照や存在しない親を残さない', async () => {
    const parent = await createVersion('racing-parent');
    const child = await createVersion('racing-child');
    const [addition, deletion] = await Promise.all([
      append(child, [parent.id]),
      request(harness.app, versionPath(parent), {
        method: 'DELETE',
        cookie: fixture.editor.cookie,
      }),
    ]);
    if (addition.status === 200) {
      expect(deletion.status).toBe(409);
      expect(
        await entity(
          await request(harness.app, `${versionPath(child)}/parents`, {
            cookie: fixture.editor.cookie,
          }),
          200,
        ),
      ).toMatchObject({ parentDatasetVersionIds: [parent.id] });
    } else {
      expect(addition.status).toBe(404);
      expect(deletion.status).toBe(204);
      expect(
        await entity(
          await request(harness.app, `${versionPath(child)}/parents`, {
            cookie: fixture.editor.cookie,
          }),
          200,
        ),
      ).toMatchObject({ items: [], parentDatasetVersionIds: [] });
    }
  });

  it('監査の保存失敗では親追記も取り消す', async () => {
    await harness.database
      .query(`CREATE FUNCTION fail_parent_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='dataset.version.parents.append' THEN RAISE EXCEPTION 'synthetic save failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER fail_parent_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_parent_audit();`);
    expect((await append()).status).toBe(503);
    expect(
      (
        await harness.database.query(
          'SELECT count(*)::int AS count FROM dataset_version_parent_additions',
        )
      ).rows[0].count,
    ).toBe(0);
    await harness.database.query(
      'DROP TRIGGER fail_parent_audit ON audit_events; DROP FUNCTION fail_parent_audit();',
    );
  });
});
