import type {
  Dataset,
  DatasetVersion,
  Job,
  LineageGraph,
  Run,
  TrainingDataStage,
  TrainingDataStagePage,
  WorkerJob,
} from '@mmt/contracts';
import { trainingDataStagePageSchema, trainingDataStageSchema } from '@mmt/contracts/schemas';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { executionFixture, projectFixture, referenceDigest } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';

describe.skipIf(!testDatabaseUrl)('事前学習途中のデータ追加（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: Awaited<ReturnType<typeof executionFixture>>;
  let datasetVersions: DatasetVersion[];
  let run: Run;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await executionFixture(harness);
    datasetVersions = [];
    for (const name of ['original', 'synthetic']) {
      const dataset = await entity<Dataset>(
        await request(harness.app, `${fixture.basePath}/datasets`, {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { name },
        }),
      );
      datasetVersions.push(
        await entity<DatasetVersion>(
          await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
            method: 'POST',
            cookie: fixture.editor.cookie,
            body: {
              version: 'v1',
              uri: `s3://training/${name}/manifest.json`,
              digest: referenceDigest(name),
            },
          }),
        ),
      );
    }
    run = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          name: 'Pretraining',
          experimentId: fixture.experiment.id,
          kind: 'training',
          codeVersionId: fixture.codeVersion.id,
          inputDatasetVersionIds: [datasetVersions[0]!.id],
        },
      }),
    );
  });
  afterAll(async () => {
    await harness?.close();
  });
  const stagesPath = () => `${fixture.basePath}/runs/${run.id}/training-data-stages`;
  const append = (startStep: number, ids = datasetVersions.map((version) => version.id)) =>
    request(harness.app, stagesPath(), {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: { startStep, inputDatasetVersionIds: ids },
    });

  it('初期入力を保ち、stepごとの全構成・入力集合・来歴を保存する', async () => {
    const stage = await entity<TrainingDataStage>(await append(1000), 200);
    expect(trainingDataStageSchema.parse(stage).startStep).toBe(1000);
    await entity(await append(2000, [datasetVersions[1]!.id]), 200);
    const history = trainingDataStagePageSchema.parse(
      await entity<TrainingDataStagePage>(
        await request(harness.app, stagesPath(), { cookie: fixture.viewer.cookie }),
        200,
      ),
    );
    expect(history.initialDatasetVersionIds).toEqual([datasetVersions[0]!.id]);
    expect(history.items.map((item) => item.startStep)).toEqual([1000, 2000]);
    const readRun = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
    expect(readRun.inputDatasetVersionIds).toEqual([datasetVersions[0]!.id]);
    expect(readRun.trainingDatasetVersionIds?.sort()).toEqual(
      datasetVersions.map((version) => version.id).sort(),
    );
    const graph = await entity<LineageGraph>(
      await request(harness.app, `${fixture.basePath}/lineage`, { cookie: fixture.viewer.cookie }),
      200,
    );
    expect(graph.edges).toContainEqual({
      source: datasetVersions[1]!.id,
      target: run.id,
      relation: 'input',
    });
    expect(
      (
        await request(
          harness.app,
          `${fixture.basePath}/datasets/${datasetVersions[1]!.datasetId}/versions/${datasetVersions[1]!.id}`,
          { method: 'DELETE', cookie: fixture.editor.cookie },
        )
      ).status,
    ).toBe(409);
  });

  it('再送と同時送信は同じ記録を返し、過去stepと同stepの変更を拒否する', async () => {
    const responses = await Promise.all([append(1000), append(1000)]);
    const stages = await Promise.all(
      responses.map((response) => entity<TrainingDataStage>(response, 200)),
    );
    expect(stages[0]).toEqual(stages[1]);
    expect((await append(1000, [datasetVersions[1]!.id])).status).toBe(409);
    expect((await append(999)).status).toBe(409);
    await expect(
      harness.database.query('UPDATE training_data_stages SET start_step=1001 WHERE id=$1', [
        stages[0]!.id,
      ]),
    ).rejects.toThrow('append-only');
    await expect(
      harness.database.query('DELETE FROM training_data_stages WHERE id=$1', [stages[0]!.id]),
    ).rejects.toThrow('purging');
  });

  it('閲覧者・他Projectのデータ・重複・空の構成を拒否する', async () => {
    expect(
      (
        await request(harness.app, stagesPath(), {
          method: 'POST',
          cookie: fixture.viewer.cookie,
          body: { startStep: 1000, inputDatasetVersionIds: [datasetVersions[1]!.id] },
        })
      ).status,
    ).toBe(403);
    expect((await append(1000, [])).status).toBe(422);
    expect((await append(1000, [datasetVersions[1]!.id, datasetVersions[1]!.id])).status).toBe(422);
    const other = await projectFixture(harness);
    const otherDataset = await entity<Dataset>(
      await request(harness.app, `${other.basePath}/datasets`, {
        method: 'POST',
        cookie: other.editor.cookie,
        body: { name: 'Other data' },
      }),
    );
    const otherVersion = await entity<DatasetVersion>(
      await request(harness.app, `${other.basePath}/datasets/${otherDataset.id}/versions`, {
        method: 'POST',
        cookie: other.editor.cookie,
        body: { version: '1', uri: 's3://other/manifest.json', digest: referenceDigest('other') },
      }),
    );
    expect((await append(1000, [otherVersion.id])).status).toBe(404);
  });

  it('自分の出力データを入力へ戻して循環を作ることを拒否する', async () => {
    const output = await entity<DatasetVersion>(
      await request(
        harness.app,
        `${fixture.basePath}/datasets/${datasetVersions[1]!.datasetId}/versions`,
        {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: {
            version: 'output',
            uri: 's3://training/output.json',
            digest: referenceDigest('output'),
            sourceRunId: run.id,
          },
        },
      ),
    );
    expect((await append(1000, [output.id])).status).toBe(422);
  });

  it('Job tokenは自分の学習中だけ記録でき、終了後の記録は凍結する', async () => {
    const job = await entity<Job>(
      await request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: run.id, targetId: fixture.target.id },
      }),
    );
    const worker = (
      await entity<{ item: WorkerJob }>(
        await request(harness.app, '/api/worker/claim', {
          method: 'POST',
          token: fixture.workerToken,
          body: { workerId: 'training-stages' },
        }),
        200,
      )
    ).item;
    const body = {
      startStep: 1000,
      inputDatasetVersionIds: datasetVersions.map((version) => version.id),
    };
    const recording = await request(harness.app, stagesPath(), {
      method: 'POST',
      token: worker.jobToken!,
      body,
    });
    if (recording.status !== 200)
      throw new Error(`HTTP ${recording.status}: ${JSON.stringify(await recording.json())}`);
    const otherRun = await fixture.newRun('Other training', 'training');
    expect(
      (
        await request(harness.app, `${fixture.basePath}/runs/${otherRun.id}/training-data-stages`, {
          method: 'POST',
          token: worker.jobToken!,
          body,
        })
      ).status,
    ).toBe(403);
    await entity(
      await request(harness.app, `/api/worker/jobs/${job.id}/complete`, {
        method: 'POST',
        token: fixture.workerToken,
        body: { leaseId: worker.job.leaseId, status: 'finished', exitCode: 0 },
      }),
      200,
    );
    expect((await append(2000)).status).toBe(409);
    expect((await append(1000)).status).toBe(200);
  });
});
