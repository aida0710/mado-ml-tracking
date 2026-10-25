import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Run, WorkflowVersion, WorkflowExecution } from '@mmt/contracts';
import { workflowVersionSchema } from '@mmt/contracts/schemas';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { workflowFixture, type WorkflowFixture } from './workflowFixtures.js';

describe.skipIf(!testDatabaseUrl)('前処理から学習までのワークフロー（独立PostgreSQL）', () => {
  let harness: Harness;
  let fixture: WorkflowFixture;
  beforeAll(async () => {
    harness = await createHarness();
  });
  beforeEach(async () => {
    await harness.reset();
    fixture = await workflowFixture(harness);
  });
  afterAll(async () => {
    await harness?.close();
  });

  it('前処理が成功すると実際の出力を学習へ渡し、変更前のTask設定を使う', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    await entity(
      await request(harness.app, `${fixture.basePath}/tasks/${fixture.training.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { expectedRevision: 1, parameters: { threshold: 0.9 } },
      }),
      200,
    );
    const job = await fixture.claim();
    const output = await fixture.output(job.run.id);
    await fixture.finish(job);
    const progressed = await fixture.execution(execution.id);
    expect(progressed.steps.map((step) => step.status)).toEqual(['finished', 'queued']);
    const run = await entity<Run>(
      await request(harness.app, `${fixture.basePath}/runs/${progressed.steps[1]!.runId}`, {
        cookie: fixture.editor.cookie,
      }),
      200,
    );
    expect(run.parameters.threshold).toBe(0.5);
    expect(run.taskRevision).toBe(1);
    expect(run.inputDatasetVersionIds).toEqual([output.id]);
    expect(run.upstreamDatasetVersionIds).toEqual([output.id]);
    expect(run.parentRunId).toBe(job.run.id);
    expect(progressed.steps[1]!.datasetUsage).toEqual([
      { datasetVersionId: output.id, role: 'training', weight: 2, selection: { seed: 42 } },
    ]);
    await fixture.finish(await fixture.claim());
    expect((await fixture.execution(execution.id)).status).toBe('finished');
  });

  it('同じ起動キーを同時に送っても実行と最初のJobは一つになる', async () => {
    const definition = await fixture.createWorkflow();
    const [first, repeated] = await Promise.all([
      fixture.launch(definition),
      fixture.launch(definition),
    ]);
    expect(first.id).toBe(repeated.id);
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM jobs')).rows[0].count,
    ).toBe(1);
    const mismatch = await request(
      harness.app,
      `${fixture.basePath}/workflows/${definition.workflow.id}/launch`,
      {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { revision: 2, idempotencyKey: 'first-start' },
      },
    );
    expect(mismatch.status).toBe(409);
  });

  it('Taskを変更しても保存したモデル登録設定で学習し、その出力モデルを評価へ渡す', async () => {
    const training = await fixture.task('training', {
      outputModel: { modelId: fixture.model.id, createModel: null, artifactPath: 'weights.bin' },
    });
    const evaluation = await fixture.task('evaluation');
    const definition = await fixture.createWorkflow([
      fixture.steps[0]!,
      { ...fixture.steps[1]!, taskId: training.id, expectedTaskRevision: training.revision },
      {
        key: 'evaluate',
        name: '評価',
        taskId: evaluation.id,
        expectedTaskRevision: evaluation.revision,
        inputs: [],
        modelFromStepKey: 'train',
        qualityGates: [],
      },
    ]);
    const execution = await fixture.launch(definition);
    await entity(
      await request(harness.app, `${fixture.basePath}/tasks/${training.id}`, {
        method: 'PATCH',
        cookie: fixture.editor.cookie,
        body: { expectedRevision: 1, outputModel: null },
      }),
      200,
    );
    const processing = await fixture.claim();
    await fixture.output(processing.run.id);
    await fixture.finish(processing);
    const train = await fixture.claim();
    await entity(
      await request(
        harness.app,
        `${fixture.basePath}/runs/${train.run.id}/artifacts?path=weights.bin`,
        {
          method: 'PUT',
          cookie: fixture.editor.cookie,
          binary: 'weights',
        },
      ),
    );
    await fixture.finish(train);
    const progressed = await fixture.execution(execution.id);
    expect(progressed.steps[1]!.outputModelVersionIds).toHaveLength(1);
    const evaluated = await fixture.claim();
    expect(evaluated.run.modelVersionId).toBe(progressed.steps[1]!.outputModelVersionIds[0]);
    await fixture.finish(evaluated);
    expect((await fixture.execution(execution.id)).status).toBe('finished');
  });

  it('親のRunは読む出力を出した最も近いステップのRunで、モデルだけを受け取るならその供給元、固定の入力だけなら無い', async () => {
    const training = await fixture.task('training', {
      outputModel: { modelId: fixture.model.id, createModel: null, artifactPath: 'weights.bin' },
    });
    const evaluation = await fixture.task('evaluation');
    const preparedInput = {
      source: { kind: 'step' as const, stepKey: 'prepare', datasetName: null },
      role: 'test' as const,
      weight: 1,
      selection: {},
    };
    const evaluationStep = {
      taskId: evaluation.id,
      expectedTaskRevision: evaluation.revision,
      modelFromStepKey: 'train',
      qualityGates: [],
    };
    await fixture.launch(
      await fixture.createWorkflow([
        fixture.steps[0]!,
        { ...fixture.steps[1]!, taskId: training.id, expectedTaskRevision: training.revision },
        // Reads the data two steps back and the model of the step before it.
        { ...evaluationStep, key: 'evaluate', name: '評価', inputs: [preparedInput] },
        { ...evaluationStep, key: 'score', name: '採点', inputs: [] },
        { ...fixture.steps[0]!, key: 'recheck', name: '再確認' },
      ]),
    );
    const runIds: string[] = [];
    for (const stepKey of ['prepare', 'train', 'evaluate', 'score', 'recheck']) {
      const job = await fixture.claim();
      if (stepKey === 'prepare') await fixture.output(job.run.id);
      if (stepKey === 'train')
        await entity(
          await request(
            harness.app,
            `${fixture.basePath}/runs/${job.run.id}/artifacts?path=weights.bin`,
            { method: 'PUT', cookie: fixture.editor.cookie, binary: 'weights' },
          ),
        );
      runIds.push(job.run.id);
      await fixture.finish(job);
    }
    const parents = await Promise.all(
      runIds.map(async (runId) => {
        const run = await entity<Run>(
          await request(harness.app, `${fixture.basePath}/runs/${runId}`, {
            cookie: fixture.viewer.cookie,
          }),
          200,
        );
        return run.parentRunId;
      }),
    );
    const [prepare, train] = runIds;
    expect(parents).toEqual([null, prepare, prepare, train, null]);
  });

  it('実行中の停止ではJobが終了するまで待ち、成功の報告が競合しても後段を起動しない', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const job = await fixture.claim();
    await fixture.output(job.run.id);
    const cancel = await entity<WorkflowExecution>(
      await request(harness.app, `${fixture.basePath}/workflow-executions/${execution.id}/cancel`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
      }),
      200,
    );
    expect(cancel.status).toBe('canceling');
    expect(
      (
        await request(harness.app, `${fixture.basePath}/jobs/${job.job.id}/retry`, {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: {},
        })
      ).status,
    ).toBe(409);
    await fixture.finish(job);
    const canceled = await fixture.execution(execution.id);
    expect(canceled.status).toBe('canceled');
    expect(canceled.steps[1]!.jobId).toBeNull();
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM jobs')).rows[0].count,
    ).toBe(1);
  });

  it('複数のスケジューラが完了を処理しても後段は一つだけ起動する', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    const job = await fixture.claim();
    await fixture.output(job.run.id);
    await entity(
      await request(harness.app, `/api/worker/jobs/${job.job.id}/complete`, {
        method: 'POST',
        token: fixture.workerToken,
        body: { leaseId: job.job.leaseId, status: 'finished', exitCode: 0 },
      }),
      200,
    );
    await Promise.all([harness.workflowScheduler.tick(), harness.workflowScheduler.tick()]);
    expect((await fixture.execution(execution.id)).steps[1]!.status).toBe('queued');
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM jobs')).rows[0].count,
    ).toBe(2);
  });

  it('品質条件を満たさない前処理は学習へ進まない', async () => {
    fixture.steps[0]!.qualityGates = [
      { metric: 'preprocessing.retained_input_ratio', operator: 'gte', threshold: 0.9 },
    ];
    const execution = await fixture.launch(await fixture.createWorkflow());
    const job = await fixture.claim();
    await entity(await fixture.report(job.run.id), 200);
    await fixture.output(job.run.id);
    await fixture.finish(job);
    const failed = await fixture.execution(execution.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('品質条件');
    expect(failed.steps[1]!.runId).toBeNull();
  });

  it('出力が足りないと理由を残し、失敗した段のRunを残さない', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    await fixture.finish(await fixture.claim());
    const failed = await fixture.execution(execution.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('output dataset');
    expect(failed.steps[1]!.runId).toBeNull();
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM runs')).rows[0].count,
    ).toBe(1);
  });

  it('失敗した学習から再開すると完了済みの前処理を再利用する', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    const processingJob = await fixture.claim();
    await fixture.output(processingJob.run.id);
    await fixture.finish(processingJob);
    await fixture.finish(await fixture.claim(), 'failed');
    const resumed = await fixture.launch(definition, {
      idempotencyKey: 'resume',
      resumeFromExecutionId: execution.id,
    });
    expect(resumed.id).not.toBe(execution.id);
    expect(resumed.steps[0]!.reused).toBe(true);
    expect(resumed.steps[0]!.runId).toBe(processingJob.run.id);
    expect(resumed.steps[1]!.status).toBe('queued');
    expect(
      (await harness.database.query('SELECT count(*)::int AS count FROM runs')).rows[0].count,
    ).toBe(3);
  });

  it('停止すると待機中のJobと後段を止め、そこから再開できる', async () => {
    const definition = await fixture.createWorkflow();
    const execution = await fixture.launch(definition);
    const canceled = await entity<WorkflowExecution>(
      await request(harness.app, `${fixture.basePath}/workflow-executions/${execution.id}/cancel`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
      }),
      200,
    );
    expect(canceled.status).toBe('canceled');
    expect(canceled.steps.map((step) => step.status)).toEqual(['canceled', 'canceled']);
    expect(
      (
        await fixture.launch(definition, {
          idempotencyKey: 'resume-canceled',
          resumeFromExecutionId: execution.id,
        })
      ).steps[0]!.status,
    ).toBe('queued');
  });

  it('後段起動時に実行者の権限が失われていれば止まる', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const job = await fixture.claim();
    await fixture.output(job.run.id);
    await harness.database.query(
      "UPDATE project_members SET role='viewer' WHERE user_id=$1 AND project_id=$2",
      [fixture.editor.userId, fixture.project.id],
    );
    await fixture.finish(job);
    expect((await fixture.execution(execution.id)).status).toBe('failed');
    expect((await fixture.execution(execution.id)).steps[1]!.runId).toBeNull();
  });

  it('viewerは定義を読めるが保存・起動できず、別Projectは参照できない', async () => {
    const definition = await fixture.createWorkflow();
    expect(
      (
        await request(harness.app, `${fixture.basePath}/workflows/${definition.workflow.id}`, {
          cookie: fixture.viewer.cookie,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/workflows`, {
          method: 'POST',
          cookie: fixture.viewer.cookie,
          body: { name: 'forbidden', steps: fixture.steps },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          harness.app,
          `${fixture.basePath}/workflows/${definition.workflow.id}/launch`,
          {
            method: 'POST',
            cookie: fixture.viewer.cookie,
            body: { revision: 1, idempotencyKey: 'forbidden' },
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(harness.app, `${fixture.basePath}/workflows/${definition.workflow.id}`, {
          cookie: fixture.outsider.cookie,
        })
      ).status,
    ).toBe(403);
  });

  it('先のステップや自分の出力は入力にできず、古いTask revisionは保存を拒む', async () => {
    fixture.steps[0]!.inputs[0]!.source = { kind: 'step', stepKey: 'train', datasetName: null };
    expect(
      (
        await request(harness.app, `${fixture.basePath}/workflows`, {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { name: 'invalid', steps: fixture.steps },
        })
      ).status,
    ).toBe(422);
    fixture.steps[0]!.inputs = [];
    fixture.steps[0]!.expectedTaskRevision = 2;
    expect(
      (
        await request(harness.app, `${fixture.basePath}/workflows`, {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { name: 'invalid', steps: fixture.steps },
        })
      ).status,
    ).toBe(409);
  });

  it('使っているバージョンを削除できず、実行設定も変更できない', async () => {
    const definition = await fixture.createWorkflow();
    const deletion = await request(
      harness.app,
      `${fixture.basePath}/datasets/${fixture.dataset.id}/versions/${fixture.raw.id}`,
      { method: 'DELETE', cookie: fixture.editor.cookie },
    );
    expect(deletion.status).toBe(409);
    const execution = await fixture.launch(definition);
    const changed = await request(
      harness.app,
      `${fixture.basePath}/runs/${execution.steps[0]!.runId}`,
      { method: 'PATCH', cookie: fixture.editor.cookie, body: { parameters: { threshold: 0.9 } } },
    );
    expect(changed.status).toBe(409);
    await expect(
      harness.database.query("UPDATE workflow_versions SET steps='[]' WHERE id=$1", [
        definition.versions[0]!.id,
      ]),
    ).rejects.toThrow();
  });

  it('新しい定義はバージョンを増やし、保存の競合を検出する', async () => {
    const definition = await fixture.createWorkflow();
    const updated = await entity<WorkflowVersion>(
      await request(
        harness.app,
        `${fixture.basePath}/workflows/${definition.workflow.id}/versions`,
        {
          method: 'POST',
          cookie: fixture.editor.cookie,
          body: { expectedRevision: 1, steps: fixture.steps },
        },
      ),
    );
    expect(updated.revision).toBe(2);
    expect(workflowVersionSchema.safeParse(updated).success).toBe(true);
    expect(
      (
        await request(
          harness.app,
          `${fixture.basePath}/workflows/${definition.workflow.id}/versions`,
          {
            method: 'POST',
            cookie: fixture.editor.cookie,
            body: { expectedRevision: 1, steps: fixture.steps },
          },
        )
      ).status,
    ).toBe(409);
  });
});
