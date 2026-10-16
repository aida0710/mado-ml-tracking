import type { Dataset, DatasetVersion, LineageGraph, LineageRelationAddition, Run } from '@mmt/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { projectFixture, referenceDigest } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';

describe.skipIf(!testDatabaseUrl)('過去の来歴の根拠付き補完', () => {
  let harness: Harness;
  let fixture: Awaited<ReturnType<typeof projectFixture>>;
  let dataset: DatasetVersion;
  let run: Run;
  beforeAll(async () => { harness = await createHarness(); });
  afterAll(async () => { await harness?.close(); });
  beforeEach(async () => {
    await harness.reset();
    fixture = await projectFixture(harness);
    const parent = await entity<Dataset>(await request(harness.app, `${fixture.basePath}/datasets`, {
      method: 'POST', cookie: fixture.editor.cookie, body: { name: 'historical data' },
    }));
    dataset = await entity<DatasetVersion>(await request(harness.app, `${fixture.basePath}/datasets/${parent.id}/versions`, {
      method: 'POST', cookie: fixture.editor.cookie,
      body: { version: 'v1', uri: 's3://test/manifest.json', digest: referenceDigest('v1') },
    }));
    const created = await entity<Run>(await request(harness.app, `${fixture.basePath}/runs`, {
      method: 'POST', cookie: fixture.editor.cookie,
      body: { experimentId: fixture.experiment.id, name: 'historical training', kind: 'training' },
    }));
    run = await entity<Run>(await request(harness.app, `${fixture.basePath}/runs/${created.id}`, {
      method: 'PATCH', cookie: fixture.editor.cookie, body: { status: 'finished' },
    }), 200);
  });
  const input = () => ({
    sourceId: dataset.id, sourceKind: 'datasetVersion', targetId: run.id, targetKind: 'run',
    relation: 'input', reason: '元Runの入力一覧と保存済みSHAを照合', evidence: { sha256: 'verified-source-digest' },
  });
  const append = (body = input(), cookie = fixture.editor.cookie) => request(harness.app,
    `${fixture.basePath}/lineage/relations`, { method: 'POST', cookie, body });

  it('入出力を復元しても元のRunを変更せず、再送で履歴を増やさない', async () => {
    const before = (await harness.database.query('SELECT * FROM runs WHERE id=$1', [run.id])).rows;
    const added = await entity<LineageRelationAddition>(await append(), 200);
    expect(await entity(await append(), 200)).toEqual(added);
    expect((await harness.database.query('SELECT * FROM runs WHERE id=$1', [run.id])).rows).toEqual(before);
    const read = await entity<Run>(await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
      cookie: fixture.viewer.cookie,
    }), 200);
    expect(read.inputDatasetVersionIds).toEqual([]);
    expect(read.trainingDatasetVersionIds).toEqual([dataset.id]);
    const graph = await entity<LineageGraph>(await request(harness.app, `${fixture.basePath}/lineage`, {
      cookie: fixture.viewer.cookie,
    }), 200);
    expect(graph.edges.filter((edge) => edge.source === dataset.id && edge.target === run.id)).toEqual([
      { source: dataset.id, target: run.id, relation: 'input' },
    ]);
    expect((await request(harness.app, `${fixture.basePath}/datasets/${dataset.datasetId}/versions/${dataset.id}`, {
      method: 'DELETE', cookie: fixture.editor.cookie,
    })).status).toBe(409);
  });

  it('資料への参照は学習入力とみなさず、根拠と理由を保存する', async () => {
    const added = await entity<LineageRelationAddition>(await append({ ...input(), relation: 'reference' }), 200);
    expect(added).toMatchObject({ reason: input().reason, evidence: input().evidence, createdBy: fixture.editor.userId });
    const read = await entity<Run>(await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
      cookie: fixture.editor.cookie,
    }), 200);
    expect(read.trainingDatasetVersionIds).toEqual([]);
  });

  it('入力と出力の循環や自己参照、種類の誤りを拒否する', async () => {
    await entity(await append(), 200);
    expect((await append({ ...input(), sourceId: run.id, sourceKind: 'run', targetId: dataset.id,
      targetKind: 'datasetVersion', relation: 'output' })).status).toBe(422);
    expect((await append({ ...input(), targetId: dataset.id })).status).toBe(422);
    expect((await append({ ...input(), relation: 'output' })).status).toBe(422);
  });

  it('権限不足と別プロジェクトの参照を拒否する', async () => {
    expect((await append(input(), fixture.viewer.cookie)).status).toBe(403);
    const other = await projectFixture(harness);
    const another = await entity<Run>(await request(harness.app, `${other.basePath}/runs`, {
      method: 'POST', cookie: other.editor.cookie,
      body: { experimentId: other.experiment.id, name: 'other', kind: 'training' },
    }));
    expect((await append({ ...input(), targetId: another.id })).status).toBe(404);
  });

  it('稼働中のRunへの補完を拒否し、記録された生成元を置き換えない', async () => {
    const another = await entity<Run>(await request(harness.app, `${fixture.basePath}/runs`, {
      method: 'POST', cookie: fixture.editor.cookie,
      body: { experimentId: fixture.experiment.id, name: 'another', kind: 'training' },
    }));
    expect((await append({ ...input(), targetId: another.id })).status).toBe(422);
    await entity(await request(harness.app, `${fixture.basePath}/runs/${another.id}`, {
      method: 'PATCH', cookie: fixture.editor.cookie, body: { status: 'finished' },
    }), 200);
    await entity(await append({ ...input(), sourceId: run.id, sourceKind: 'run',
      targetId: dataset.id, targetKind: 'datasetVersion', relation: 'output' }), 200);
    const outputs = await entity<Run>(await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
      cookie: fixture.viewer.cookie,
    }), 200);
    expect(outputs.outputDatasetVersionIds).toEqual([dataset.id]);
    const versions = await entity<{ items: DatasetVersion[] }>(await request(harness.app,
      `${fixture.basePath}/datasets/${dataset.datasetId}/versions`, { cookie: fixture.viewer.cookie }), 200);
    expect(versions.items[0]?.sourceRunId).toBe(run.id);
    expect((await append({ ...input(), sourceId: another.id, sourceKind: 'run',
      targetId: dataset.id, targetKind: 'datasetVersion', relation: 'output' })).status).toBe(409);
  });
});
