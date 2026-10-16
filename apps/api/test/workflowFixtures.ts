import { workerInfo } from './workerFixtures.js';
import type {
  CodeVersion,
  Dataset,
  DatasetVersion,
  ExperimentTask,
  PreprocessingReportInput,
  WorkflowDetail,
  WorkflowExecution,
  WorkflowStepInput,
  WorkerCapability,
  WorkerJob,
} from '@mmt/contracts';
import { WORKER_CAPABILITIES } from '@mmt/contracts';
import { executionFixture, referenceDigest } from './fixtures.js';
import { entity, request, type Harness } from './harness.js';

export function createPreprocessingReportInput(overrides: Partial<PreprocessingReportInput> = {}) {
  return {
    inputCount: 10,
    outputCount: 8,
    excludedCount: 2,
    failedCount: 0,
    exclusions: [{ reason: '短い音声', count: 2 }],
    ...overrides,
  };
}

export async function workflowFixture(harness: Harness) {
  const fixture = await executionFixture(harness);
  const codeVersion = await entity<CodeVersion>(
    await request(harness.app, `${fixture.basePath}/codes/${fixture.code.id}/versions`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        runtime: { kind: 'python' },
        version: 'workflow-v1',
        source: { kind: 'inline', files: { 'main.py': 'print("workflow")\n' } },
        entrypoint: ['python', 'main.py'],
        supportedModelFamilies: ['qwen2'],
        taskTypes: ['processing', 'training', 'evaluation'],
      },
    }),
  );
  const dataset = await entity<Dataset>(
    await request(harness.app, `${fixture.basePath}/datasets`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: { name: 'Raw speech' },
    }),
  );
  const raw = await entity<DatasetVersion>(
    await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        version: 'v1',
        uri: 'https://datasets.example.test/raw.json',
        digest: referenceDigest('raw'),
      },
    }),
  );
  async function task(
    kind: 'processing' | 'training' | 'evaluation',
    overrides: Record<string, unknown> = {},
  ) {
    return entity<ExperimentTask>(
      await request(harness.app, `${fixture.basePath}/tasks`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          name: kind,
          experimentId: fixture.experiment.id,
          kind,
          codeVersionId: codeVersion.id,
          targetId: fixture.target.id,
          parameters: { threshold: 0.5 },
          ...overrides,
        },
      }),
    );
  }
  const processing = await task('processing');
  const training = await task('training');
  const steps: WorkflowStepInput[] = [
    {
      key: 'prepare',
      name: '前処理',
      taskId: processing.id,
      expectedTaskRevision: processing.revision,
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
    {
      key: 'train',
      name: '学習',
      taskId: training.id,
      expectedTaskRevision: training.revision,
      inputs: [
        {
          source: { kind: 'step', stepKey: 'prepare', datasetName: null },
          role: 'training',
          weight: 2,
          selection: { seed: 42 },
        },
      ],
      modelFromStepKey: null,
      qualityGates: [],
    },
  ];
  async function createWorkflow(inputSteps = steps) {
    return entity<WorkflowDetail>(
      await request(harness.app, `${fixture.basePath}/workflows`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name: '前処理と学習', steps: inputSteps },
      }),
    );
  }
  async function launch(workflow: WorkflowDetail, overrides: Record<string, unknown> = {}) {
    return entity<WorkflowExecution>(
      await request(harness.app, `${fixture.basePath}/workflows/${workflow.workflow.id}/launch`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { revision: 1, idempotencyKey: 'first-start', ...overrides },
      }),
    );
  }
  /** A claim by a worker that names `capabilities`; a current worker names them all. */
  async function claimAs(capabilities: WorkerCapability[]): Promise<WorkerJob | null> {
    return (
      await entity<{ item: WorkerJob | null }>(
        await request(harness.app, '/api/worker/claim', {
          method: 'POST',
          token: fixture.workerToken,
          body: { workerId: 'workflow-worker', workerInfo: { ...workerInfo, capabilities } },
        }),
        200,
      )
    ).item;
  }
  async function claim(): Promise<WorkerJob> {
    return (await claimAs([...WORKER_CAPABILITIES]))!;
  }
  /** The worker reports the Job's end; the scheduler has not seen it yet. */
  async function complete(job: WorkerJob, status: 'finished' | 'failed' = 'finished') {
    await entity(
      await request(harness.app, `/api/worker/jobs/${job.job.id}/complete`, {
        method: 'POST',
        token: fixture.workerToken,
        body: { leaseId: job.job.leaseId, status, exitCode: status === 'finished' ? 0 : 1 },
      }),
      200,
    );
  }
  async function finish(job: WorkerJob, status: 'finished' | 'failed' = 'finished') {
    await complete(job, status);
    await harness.workflowScheduler.tick();
  }
  async function output(runId: string, name = 'Processed speech') {
    const outputDataset = await entity<Dataset>(
      await request(harness.app, `${fixture.basePath}/datasets`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: { name },
      }),
    );
    return entity<DatasetVersion>(
      await request(harness.app, `${fixture.basePath}/datasets/${outputDataset.id}/versions`, {
        method: 'POST',
        cookie: fixture.editor.cookie,
        body: {
          version: 'v1',
          sourceRunId: runId,
          parentDatasetVersionIds: [raw.id],
          uri: 'https://datasets.example.test/processed.json',
          digest: referenceDigest(name),
        },
      }),
    );
  }
  async function execution(id: string) {
    return entity<WorkflowExecution>(
      await request(harness.app, `${fixture.basePath}/workflow-executions/${id}`, {
        cookie: fixture.viewer.cookie,
      }),
      200,
    );
  }
  async function report(runId: string, overrides: Partial<PreprocessingReportInput> = {}) {
    return request(harness.app, `${fixture.basePath}/runs/${runId}/preprocessing-report`, {
      method: 'PUT',
      cookie: fixture.editor.cookie,
      body: createPreprocessingReportInput(overrides),
    });
  }
  return {
    ...fixture,
    codeVersion,
    raw,
    dataset,
    processing,
    training,
    steps,
    task,
    createWorkflow,
    launch,
    claimAs,
    claim,
    complete,
    finish,
    output,
    execution,
    report,
  };
}

export type WorkflowFixture = Awaited<ReturnType<typeof workflowFixture>>;
