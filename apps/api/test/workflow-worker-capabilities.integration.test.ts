import { workerInfo } from './workerFixtures.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Job, JobListItem, WorkerJob, WorkerPresence } from '@mmt/contracts';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { workflowFixture, type WorkflowFixture } from './workflowFixtures.js';

describe.skipIf(!testDatabaseUrl)('ワークフローのJobとworkerの対応機能（独立PostgreSQL）', () => {
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

  function claim(body: Record<string, unknown>) {
    return request(harness.app, '/api/worker/claim', {
      method: 'POST',
      token: fixture.workerToken,
      body: { workerInfo, workerId: 'limited-worker', ...body },
    });
  }

  async function claimedJob(body: Record<string, unknown>): Promise<WorkerJob | null> {
    return (await entity<{ item: WorkerJob | null }>(await claim(body), 200)).item;
  }

  async function jobs(): Promise<JobListItem[]> {
    return (
      await entity<{ items: JobListItem[] }>(
        await request(harness.app, `${fixture.basePath}/jobs`, { cookie: fixture.viewer.cookie }),
        200,
      )
    ).items;
  }

  async function workers(): Promise<WorkerPresence[]> {
    return (
      await entity<{ items: WorkerPresence[] }>(
        await request(harness.app, `${fixture.basePath}/workers`, {
          cookie: fixture.viewer.cookie,
        }),
        200,
      )
    ).items;
  }

  it('対応を名乗らないworkerはワークフローのJobを受け取らず、ほかのJobは受け取る', async () => {
    const execution = await fixture.launch(await fixture.createWorkflow());
    const run = await fixture.newRun('Plain inference');
    const plainJob = await entity<Job>(
      await request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: run.id, targetId: fixture.target.id },
      }),
    );
    // ワークフローのJobの方が古いが、データセットの使用状況を渡さないworkerはそれを飛ばす。
    const older = await claimedJob({ workerInfo: { ...workerInfo, version: '0.9.0' } });
    expect(older?.job.id).toBe(plainJob.id);
    expect(await claimedJob({ workerInfo, workerId: 'empty-capabilities' })).toBeNull();
    expect(
      await claimedJob({ workerId: 'none-named', workerInfo: { ...workerInfo, capabilities: [] } }),
    ).toBeNull();

    const current = await fixture.claim();
    expect(current.job.id).toBe(execution.steps[0]!.jobId);
    expect(current.run.environment).toMatchObject({ workflow: { executionId: execution.id } });
  });

  it('知らない機能や重複した機能を名乗るclaimは断る', async () => {
    for (const capabilities of [['gpuTelepathy'], ['workflowDatasetUsage', 'workflowDatasetUsage']])
      expect((await claim({ workerInfo: { ...workerInfo, capabilities } })).status).toBe(422);
  });

  it('workerの一覧には最後に名乗った機能が出て、名乗らなくなれば空になる', async () => {
    await claimedJob({ workerInfo: { ...workerInfo, capabilities: ['workflowDatasetUsage'] } });
    expect((await workers()).map((worker) => worker.capabilities)).toEqual([
      ['workflowDatasetUsage'],
    ]);
    // 同じworker idで、何も名乗らない古いバージョンとして再起動した。
    await claimedJob({ workerInfo: { ...workerInfo, version: '0.9.0' } });
    expect((await workers()).map((worker) => worker.capabilities)).toEqual([[]]);
  });

  it('Jobの一覧はワークフローのJobに実行と要る機能を示し、再利用したステップや通常のJobには示さない', async () => {
    const definition = await fixture.createWorkflow();
    const first = await fixture.launch(definition);
    const processing = await fixture.claim();
    await fixture.output(processing.run.id);
    await fixture.finish(processing);
    const failedTraining = await fixture.claim();
    await fixture.finish(failedTraining, 'failed');
    const resumed = await fixture.launch(definition, {
      idempotencyKey: 'resume',
      resumeFromExecutionId: first.id,
    });
    const run = await fixture.newRun('Plain inference');
    const plainJob = await entity<Job>(
      await request(harness.app, `${fixture.basePath}/jobs`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { runId: run.id, targetId: fixture.target.id },
      }),
    );

    const listed = new Map((await jobs()).map((job) => [job.id, job]));
    const startedBy = (executionId: string) => ({
      workflowExecution: { workflowId: definition.workflow.id, executionId },
      requiredWorkerCapabilities: ['workflowDatasetUsage'],
    });
    // 再開した実行は最初のステップのJobを使い回す。そのJobを始めたのは最初の実行。
    expect(listed.get(processing.job.id)).toMatchObject(startedBy(first.id));
    expect(listed.get(failedTraining.job.id)).toMatchObject(startedBy(first.id));
    expect(listed.get(resumed.steps[1]!.jobId!)).toMatchObject(startedBy(resumed.id));
    expect(listed.get(plainJob.id)).toMatchObject({
      workflowExecution: null,
      requiredWorkerCapabilities: [],
    });
  });
});
