import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import type { Artifact, Dataset, DatasetVersion, WorkflowStepInput } from '@mmt/contracts';
import { createHarness, entity, request } from '../apps/api/test/harness.js';
import { workflowFixture } from '../apps/api/test/workflowFixtures.js';

// 専用のloopbackのポートを使い、この検証を共有のpreview環境とそのworkerから離す。
const API_PORT = 47160;
const WEB_PORT = 47161;
const root = path.resolve('var/workflow-verification');
await mkdir(root, { recursive: true });
const harness = await createHarness({
  environment: {
    MMT_WEB_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
    MMT_PUBLIC_URL: `http://127.0.0.1:${API_PORT}`,
    MMT_ALLOW_PRIVATE_ORIGINS: 'true',
  },
});
const fixture = await workflowFixture(harness);
await entity(
  await request(harness.app, `/api/targets/${fixture.target.id}`, {
    method: 'PATCH',
    cookie: fixture.administrator.cookie,
    body: {
      workDirectory: path.join(root, 'jobs'),
      pythonExecutable: path.resolve('python/.venv/bin/python'),
    },
  }),
  200,
);
const outputDataset = await entity<Dataset>(
  await request(harness.app, `${fixture.basePath}/datasets`, {
    method: 'POST',
    cookie: fixture.editor.cookie,
    body: { name: '前処理済み音声' },
  }),
);
const rawContents = JSON.stringify(
  Array.from({ length: 10 }, (_, index) => ({ duration: index, text: `sample-${index}` })),
);
const rawArtifact = await entity<Artifact>(
  await request(harness.app, `${fixture.basePath}/artifacts?path=raw.json`, {
    method: 'PUT',
    cookie: fixture.editor.cookie,
    binary: rawContents,
  }),
);
const raw = await entity<DatasetVersion>(
  await request(harness.app, `${fixture.basePath}/datasets/${fixture.dataset.id}/versions`, {
    method: 'POST',
    cookie: fixture.editor.cookie,
    body: {
      version: 'cpu-v1',
      content: { kind: 'artifacts', files: [{ path: 'raw.json', artifactId: rawArtifact.id }] },
    },
  }),
);
const tasks = [];
for (const kind of ['processing', 'training', 'evaluation'] as const) {
  const filename = kind === 'processing' ? 'preprocessing' : kind;
  const version = await entity<{ id: string }>(
    await request(harness.app, `${fixture.basePath}/codes/${fixture.code.id}/versions`, {
      method: 'POST',
      cookie: fixture.editor.cookie,
      body: {
        version: `workflow-${kind}`,
        source: {
          kind: 'inline',
          files: { 'main.py': await readFile(`scripts/fixtures/workflows/${filename}.py`, 'utf8') },
        },
        entrypoint: ['python', 'main.py'],
        supportedModelFamilies: ['qwen2'],
        taskTypes: [kind],
      },
    }),
  );
  tasks.push(
    await fixture.task(kind, {
      name: { processing: '音声の前処理', training: '音声の学習', evaluation: '音声の評価' }[kind],
      codeVersionId: version.id,
      inputDatasetVersionIds: kind === 'processing' ? [raw.id] : [],
      parameters:
        kind === 'processing' ? { minimumDuration: 2, outputDatasetId: outputDataset.id } : {},
      ...(kind === 'training'
        ? { outputModel: { modelId: fixture.model.id, artifactPath: 'container/weights.bin' } }
        : {}),
    }),
  );
}
const steps: WorkflowStepInput[] = [
  {
    ...fixture.steps[0]!,
    taskId: tasks[0]!.id,
    inputs: [
      {
        source: { kind: 'dataset', datasetVersionId: raw.id },
        role: 'input',
        weight: 1,
        selection: {},
      },
    ],
  },
  { ...fixture.steps[1]!, taskId: tasks[1]!.id },
  {
    key: 'evaluate',
    name: '評価',
    taskId: tasks[2]!.id,
    expectedTaskRevision: 1,
    inputs: [],
    modelFromStepKey: 'train',
    qualityGates: [],
  },
];
const workflow = await fixture.createWorkflow(steps);
const execution = await fixture.launch(workflow);
// 一時的なテスト用workerの認証情報を持つのは、この非公開のファイルだけ。報告には決して写さない。
const workerSettingsPath = path.join(root, 'worker-settings.json');
const workerCredential = await entity<{ token: string }>(
  await request(harness.app, '/api/tokens', {
    method: 'POST',
    cookie: fixture.administrator.cookie,
    body: {
      name: 'CPU workflow verification',
      projectId: fixture.project.id,
      scopes: ['read', 'worker:execute', 'artifacts:write', 'registry:write'],
    },
  }),
);
await writeFile(
  workerSettingsPath,
  JSON.stringify({
    MMT_API_URL: `http://127.0.0.1:${API_PORT}`,
    MMT_API_TOKEN: workerCredential.token,
    MMT_WORKER_ID: 'workflow-verification',
    MMT_WORKER_TARGET_IDS: fixture.target.id,
    MMT_WORKER_STATE_DIR: path.join(root, 'state'),
    MMT_ALLOW_LOCAL_EXECUTOR: 'true',
  }),
  { mode: 0o600 },
);
await writeFile(
  path.join(root, 'summary.json'),
  JSON.stringify(
    {
      projectId: fixture.project.id,
      workflowId: workflow.workflow.id,
      executionId: execution.id,
      tasks: tasks.map((task) => ({ id: task.id, name: task.name })),
      rawVersionId: raw.id,
    },
    null,
    2,
  ),
);
harness.workflowScheduler.start();
harness.artifactUploadFinalizer.start();
const server = serve({ hostname: '127.0.0.1', port: API_PORT, fetch: harness.app.fetch });
const worker = spawn(
  path.resolve('python/.venv/bin/python'),
  ['scripts/serve_workbench_worker.py', '--settings', workerSettingsPath],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);
console.log(`Workflow verification API listening on 127.0.0.1:${API_PORT}`);
/**
 * シグナルで終了したworkerには終了コードが無く、シグナルのコードだけがある。どちらかが
 * あれば終わっている。
 */
function workerEnded(): Promise<void> {
  if (worker.exitCode !== null || worker.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => worker.once('exit', () => resolve()));
}
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    worker.kill('SIGTERM');
    await workerEnded();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await harness.workflowScheduler.stop();
    await harness.artifactUploadFinalizer.stop();
    await harness.close();
  } finally {
    // 上の段階が失敗しても、workerのtokenを検証より長く残してはいけない。
    await rm(workerSettingsPath, { force: true });
  }
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
