import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  CodeVersion,
  Dataset,
  DatasetVersion,
  ExperimentTask,
  SiteSubmission,
  WorkerCapability,
  WorkflowDetail,
  WorkflowExecution,
} from '@mmt/contracts';
import { WORKER_CAPABILITIES } from '@mmt/contracts';
import { containerCodeInput } from './containerFixtures.js';
import { referenceDigest } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { siteFixture, type SiteFixture } from './siteFixtures.js';

/** 前処理のTaskをfixtureのsiteで動かす、stepが1つのワークフロー。1回だけ起動する。 */
async function launchSiteWorkflow(
  harness: Harness,
  fixture: SiteFixture,
): Promise<WorkflowExecution> {
  const post = async <T>(path: string, body: unknown): Promise<T> =>
    entity<T>(
      await request(harness.app, `${fixture.basePath}${path}`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body,
      }),
    );
  const code = await post<CodeVersion>(
    `/codes/${fixture.code.id}/versions`,
    containerCodeInput({ version: 'container-processing', taskTypes: ['processing'] }),
  );
  const dataset = await post<Dataset>('/datasets', { name: 'Raw speech' });
  const raw = await post<DatasetVersion>(`/datasets/${dataset.id}/versions`, {
    version: 'v1',
    uri: 'https://datasets.example.test/raw.json',
    digest: referenceDigest('raw'),
  });
  const task = await post<ExperimentTask>('/tasks', {
    name: 'processing',
    experimentId: fixture.experiment.id,
    kind: 'processing',
    codeVersionId: code.id,
    targetId: fixture.site.id,
  });
  const workflow = await post<WorkflowDetail>('/workflows', {
    name: 'siteの前処理',
    steps: [
      {
        key: 'prepare',
        name: '前処理',
        taskId: task.id,
        expectedTaskRevision: task.revision,
        inputs: [
          {
            source: { kind: 'dataset', datasetVersionId: raw.id },
            role: 'input',
            weight: 1,
            selection: {},
          },
        ],
        modelFromStepKey: null,
        qualityGates: [],
      },
    ],
  });
  return post<WorkflowExecution>(`/workflows/${workflow.workflow.id}/launch`, {
    revision: 1,
    idempotencyKey: 'site-start',
  });
}

describe.skipIf(!testDatabaseUrl)('siteのワークフローのJobとrunnerの対応機能（独立PostgreSQL）', () => {
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

  async function launcherClaim(
    fixture: SiteFixture,
    capabilities: WorkerCapability[],
  ): Promise<SiteSubmission[]> {
    return (
      await entity<{ items: SiteSubmission[] }>(
        await request(harness.app, '/api/launcher/site-submissions/claim', {
          method: 'POST',
          token: fixture.launcherToken,
          body: { capabilities },
        }),
        200,
      )
    ).items;
  }

  function manualClaim(fixture: SiteFixture, body: Record<string, unknown>) {
    return request(harness.app, '/api/manual-submissions/claim', {
      method: 'POST',
      token: fixture.personalToken,
      body: { targetId: fixture.site.id, submitterId: 'laptop', ...body },
    });
  }

  it('対応を名乗らないlauncherはワークフローのJobを受け取らず、ほかのJobは受け取る', async () => {
    const fixture = await siteFixture(harness);
    const execution = await launchSiteWorkflow(harness, fixture);
    const plainJob = await fixture.newSiteJob();

    // ワークフローのJobの方が古いが、runnerがデータセットの使い方をJobに渡さないlauncherは、
    // そのJobを飛ばす。
    const plain = await launcherClaim(fixture, []);
    expect(plain.flatMap((submission) => submission.jobs.map((item) => item.job.id))).toEqual([
      plainJob.id,
    ]);
    expect(await launcherClaim(fixture, [])).toEqual([]);

    const [current] = await launcherClaim(fixture, [...WORKER_CAPABILITIES]);
    expect(current!.jobs[0]!.job.id).toBe(execution.steps[0]!.jobId);
    expect(current!.jobs[0]!.run.environment).toMatchObject({
      workflow: { executionId: execution.id },
      datasetUsage: [{ role: 'input', weight: 1 }],
    });
  });

  it('対応を名乗らないmado-tracking submitは、自分のワークフローのJobを受け取らない', async () => {
    const fixture = await siteFixture(harness, { submissionMode: 'manual' });
    const execution = await launchSiteWorkflow(harness, fixture);
    expect(
      (await entity<{ items: SiteSubmission[] }>(await manualClaim(fixture, { capabilities: [] }), 200)).items,
    ).toEqual([]);

    const claimed = await entity<{ items: SiteSubmission[] }>(
      await manualClaim(fixture, { capabilities: [...WORKER_CAPABILITIES] }),
      200,
    );
    expect(claimed.items.map((submission) => submission.jobs[0]!.job.id)).toEqual([
      execution.steps[0]!.jobId,
    ]);
  });

  it('capabilitiesを省略するとlauncherと手動投入のclaimは422になる', async () => {
    const fixture = await siteFixture(harness, { submissionMode: 'manual' });
    expect((await manualClaim(fixture, {})).status).toBe(422);
    const response = await request(harness.app, '/api/launcher/site-submissions/claim', {
      method: 'POST', token: fixture.launcherToken, body: {},
    });
    expect(response.status).toBe(422);
  });

  it('知らない機能や重複した機能を名乗るsiteのclaimは断る', async () => {
    const fixture = await siteFixture(harness, { submissionMode: 'manual' });
    const refused = [['gpuTelepathy'], ['workflowDatasetUsage', 'workflowDatasetUsage']];
    for (const capabilities of refused) {
      expect((await manualClaim(fixture, { capabilities })).status).toBe(422);
      const launcherResponse = await request(harness.app, '/api/launcher/site-submissions/claim', {
        method: 'POST',
        token: fixture.launcherToken,
        body: { capabilities },
      });
      expect(launcherResponse.status).toBe(422);
    }
  });
});
