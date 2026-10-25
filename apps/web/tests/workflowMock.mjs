// Workflows for the browser tests: one workflow with more versions than GET /workflows/:id
// returns, two pages of executions (one started by another editor), the Tasks they pin, and the
// processing Run of a step. It answers before createBrowserApi's route and never touches the API.

// The API's newest-version page (contracts WORKFLOW_VERSIONS_PAGE_SIZE).
const NEWEST_VERSIONS = 20;
const VERSION_COUNT = 25;
// Executions per history page here; the API pages by WORKFLOW_PAGE_SIZE, the screen by nextCursor.
const HISTORY_PAGE_SIZE = 3;
const OLDER_VERSIONS_CURSOR = 'older-versions';

export function createWorkflowMock(api) {
  const { project, user } = api.state;
  const now = '2026-10-12T00:00:00.000Z';
  // The first block differs between ids, as in real UUIDs: the screens show it as the short id.
  const FIRST_ID_BLOCK = 0xa0000000;
  const ids = { next: 1 };
  const id = (block) =>
    `${(FIRST_ID_BLOCK + ids.next++).toString(16)}-0000-4000-9${block}-000000000000`;
  const colleague = {
    id: id('001'),
    email: 'colleague@example.invalid',
    displayName: '共同研究者B',
    isAdmin: false,
    username: 'colleague',
    status: 'active',
    authSources: ['local'],
    kind: 'human',
  };
  const target = api.state.targets[0];
  const datasetVersion = api.state.datasetVersions[0];
  const task = (fields) => ({
    projectId: project.id,
    experimentId: api.state.experiments?.[0]?.id ?? id('002'),
    description: '',
    codeVersionId: api.state.codeVersions?.[0]?.id ?? id('003'),
    modelVersionId: null,
    parameters: {},
    tags: {},
    targetId: target.id,
    gpuIds: [],
    gpuCount: 0,
    walltimeSeconds: null,
    outputModel: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...fields,
  });
  const preprocessingTask = task({
    id: id('004'),
    name: '音声の前処理',
    kind: 'processing',
    inputDatasetVersionIds: [datasetVersion.id],
  });
  const trainingTask = task({
    id: id('005'),
    name: '音声の学習',
    kind: 'training',
    inputDatasetVersionIds: [],
  });
  const workflowId = id('006');
  const steps = [
    {
      key: 'prepare',
      name: '前処理',
      task: preprocessingTask,
      inputs: [
        {
          source: { kind: 'dataset', datasetVersionId: datasetVersion.id },
          role: 'input',
          weight: 1,
          selection: {},
        },
      ],
      modelFromStepKey: null,
      qualityGates: [
        { metric: 'preprocessing.retained_input_ratio', operator: 'gte', threshold: 0.9 },
      ],
    },
    {
      key: 'train',
      name: '学習',
      task: trainingTask,
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
  const versions = Array.from({ length: VERSION_COUNT }, (_, index) => ({
    id: id('007'),
    projectId: project.id,
    workflowId,
    revision: VERSION_COUNT - index,
    steps,
    createdBy: user.id,
    createdAt: now,
  }));
  const workflow = {
    id: workflowId,
    projectId: project.id,
    name: '音声の前処理と学習',
    description: '前処理の品質を確かめてから学習する',
    latestRevision: VERSION_COUNT,
    createdBy: user.id,
    createdAt: now,
  };
  const processingRun = {
    ...api.state.runs[0],
    id: id('008'),
    name: 'workflow-prepare',
    kind: 'processing',
    status: 'finished',
    tags: {},
    latestMetrics: { 'preprocessing.retained_input_ratio': 0.8 },
  };
  api.state.runs.push(processingRun);
  const stepExecution = (fields) => ({
    id: id('009'),
    stepIndex: 0,
    stepKey: 'prepare',
    name: '前処理',
    status: 'finished',
    runId: null,
    jobId: null,
    reused: false,
    datasetUsage: [],
    outputDatasetVersionIds: [],
    outputModelVersionIds: [],
    metrics: {},
    error: null,
    endedAt: null,
    preprocessingReport: null,
    ...fields,
  });
  const execution = (fields) => {
    const executionId = id('00a');
    return {
      id: executionId,
      projectId: project.id,
      workflowId,
      workflowVersionId: versions[0].id,
      revision: VERSION_COUNT,
      status: 'finished',
      createdBy: user.id,
      createdAt: now,
      endedAt: null,
      error: null,
      resumeFromExecutionId: null,
      steps: [
        stepExecution({ runId: processingRun.id, metrics: { 'preprocessing.retained_input_ratio': 0.95 } }),
        stepExecution({ stepIndex: 1, stepKey: 'train', name: '学習', status: 'finished' }),
      ],
      ...fields,
    };
  };
  const executions = [
    execution({
      createdBy: colleague.id,
      status: 'running',
      steps: [
        stepExecution({ runId: processingRun.id }),
        stepExecution({ stepIndex: 1, stepKey: 'train', name: '学習', status: 'running' }),
      ],
    }),
    execution({
      status: 'failed',
      revision: VERSION_COUNT - 1,
      error: '品質条件 preprocessing.retained_input_ratio ≥ 0.9 を満たしません',
      steps: [
        stepExecution({ runId: processingRun.id, metrics: { 'preprocessing.retained_input_ratio': 0.8 } }),
        stepExecution({ stepIndex: 1, stepKey: 'train', name: '学習', status: 'canceled' }),
      ],
    }),
    execution({ status: 'finished' }),
    execution({ status: 'canceled', revision: 1 }),
  ];
  processingRun.tags = {
    'mmt.workflowId': workflowId,
    'mmt.workflowExecutionId': executions[1].id,
  };
  const state = {
    workflow,
    versions,
    executions,
    colleague,
    processingRun,
    launches: [],
    cancels: [],
    created: [],
    /** The next launch is accepted but answered with 503, as when the answer is lost. */
    loseNextLaunchAnswer: false,
  };
  const summary = ({ steps: _steps, ...rest }) => rest;

  function historyPage(cursor) {
    const start = cursor ? Number(cursor) : 0;
    const items = state.executions.slice(start, start + HISTORY_PAGE_SIZE).map(summary);
    const next = start + HISTORY_PAGE_SIZE;
    return { items, nextCursor: next < state.executions.length ? String(next) : null };
  }

  function launch(body) {
    state.launches.push(body);
    const earlier = state.launches
      .slice(0, -1)
      .find((launched) => launched.idempotencyKey === body.idempotencyKey && launched.executionId);
    // The same key again: the first execution, as the API's idempotent launch returns it.
    if (earlier) {
      state.launches.at(-1).executionId = earlier.executionId;
      return state.executions.find((item) => item.id === earlier.executionId);
    }
    const started = execution({
      status: 'running',
      revision: body.revision,
      resumeFromExecutionId: body.resumeFromExecutionId ?? null,
      steps: [stepExecution({ status: 'running' }), stepExecution({ stepIndex: 1, stepKey: 'train', name: '学習', status: 'pending' })],
    });
    state.executions.unshift(started);
    state.launches.at(-1).executionId = started.id;
    return started;
  }

  /** Answers a workflow request, or returns false for createBrowserApi to answer it. */
  async function route(route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    // /api/projects/:p/<resource>/<key>/<subresource>
    const [, , , resource, key, subresource] = url.pathname.replace(/^\/api/, '').split('/');
    const reply = async (payload, status = 200) => {
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
      return true;
    };
    const body = () => request.postDataJSON();
    if (resource === 'tasks' && !key && method === 'GET')
      return reply({ items: [preprocessingTask, trainingTask] });
    // Project members by name, for the creator a stop confirmation shows.
    if (resource === 'members' && method === 'GET')
      return reply({
        items: [
          { user, role: project.role, directRole: project.role, groups: [] },
          { user: colleague, role: 'editor', directRole: 'editor', groups: [] },
        ],
      });
    if (resource === 'workflows') {
      if (!key && method === 'GET') return reply({ items: [workflow] });
      // A created workflow is answered as the existing one, so its page opens on known data.
      if (!key && method === 'POST') {
        state.created.push(body());
        return reply({ workflow, versions: versions.slice(0, NEWEST_VERSIONS), olderVersionsCursor: OLDER_VERSIONS_CURSOR }, 201);
      }
      if (key !== workflowId) return false;
      if (!subresource && method === 'GET')
        return reply({
          workflow,
          versions: versions.slice(0, NEWEST_VERSIONS),
          olderVersionsCursor: OLDER_VERSIONS_CURSOR,
        });
      if (subresource === 'versions' && method === 'GET')
        return url.searchParams.get('cursor') === OLDER_VERSIONS_CURSOR
          ? reply({ items: versions.slice(NEWEST_VERSIONS), nextCursor: null })
          : reply({ error: 'invalid cursor', code: 'invalid_cursor' }, 400);
      if (subresource === 'executions' && method === 'GET')
        return reply(historyPage(url.searchParams.get('cursor')));
      if (subresource === 'launch' && method === 'POST') {
        const started = launch(body());
        if (state.loseNextLaunchAnswer) {
          state.loseNextLaunchAnswer = false;
          return reply({ error: 'UI verification: the answer was lost' }, 503);
        }
        return reply(started, 201);
      }
    }
    if (resource === 'workflow-executions') {
      const found = state.executions.find((item) => item.id === key);
      if (!found) return false;
      if (!subresource && method === 'GET') return reply(found);
      if (subresource === 'cancel' && method === 'POST') {
        state.cancels.push(found.id);
        found.status = 'canceling';
        return reply(found);
      }
    }
    if (resource === 'runs' && key === processingRun.id) {
      if (subresource === 'dataset-usage' && method === 'GET')
        return reply({
          items: [{ datasetVersionId: datasetVersion.id, role: 'input', weight: 1, selection: {} }],
        });
      if (subresource === 'preprocessing-report' && method === 'GET')
        return reply({
          report: {
            runId: processingRun.id,
            projectId: project.id,
            revision: 1,
            inputCount: 10,
            outputCount: 8,
            excludedCount: 2,
            failedCount: 0,
            inputDurationSeconds: 60,
            outputDurationSeconds: 48,
            exclusions: [{ reason: '短い音声', count: 2 }],
            failures: [],
            metrics: { snr_mean: 21.5 },
            sampleArtifactIds: [],
            metadata: {},
            updatedAt: now,
          },
        });
    }
    return false;
  }

  return { state, route };
}
