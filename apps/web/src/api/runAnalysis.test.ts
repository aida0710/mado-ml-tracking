import type {
  ParameterImportanceResult,
  Run,
  RunAnalysisTableResponse,
  RunComparison,
  RunComparisonRow,
  Sweep,
  SweepTrial,
} from '@mmt/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAnalysisApi } from './runAnalysis';

afterEach(() => vi.unstubAllGlobals());

const createdAt = '2026-10-08T00:00:00.000Z';
const projectId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const runId = (index: number) => `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`;
const emptyTable = { runs: [], params: [], metrics: [] } satisfies RunAnalysisTableResponse;
const importance = {
  targetMetric: 'loss',
  targetSource: 'sweep_objective',
  runCount: 0,
  skippedRunCount: 0,
  entries: [],
  excluded: [],
  importanceUnavailableReason: 'too_few_runs',
  outOfBagR2: null,
} satisfies ParameterImportanceResult;

function run(latestMetrics: Run['latestMetrics'], index: number): Run {
  return {
    id: runId(index),
    projectId,
    experimentId: '00000000-0000-4000-8000-000000000003',
    name: `run-${index}`,
    kind: 'training',
    status: 'finished',
    parameters: {},
    tags: {},
    latestMetrics,
    modelVersionId: null,
    codeVersionId: null,
    inputDatasetVersionIds: [],
    upstreamDatasetVersionIds: [],
    outputDatasetVersionIds: [],
    outputModelVersionIds: [],
    parentRunId: null,
    environment: {},
    createdBy: userId,
    createdByName: null,
    createdAt,
    startedAt: null,
    endedAt: null,
    error: null,
  };
}

function comparison(rows: (Pick<RunComparisonRow, 'namespace' | 'key'> & Partial<RunComparisonRow>)[]): RunComparison {
  return {
    runs: [],
    baselineRunId: null,
    datasetVersions: [],
    modelVersions: [],
    rows: rows.map((row) => ({ values: [], ...row })),
  };
}

const sweep = {
  id: '00000000-0000-4000-8000-000000000004',
  projectId,
  name: 'lr探索',
  taskId: '00000000-0000-4000-8000-000000000005',
  taskRevision: 1,
  experimentId: '00000000-0000-4000-8000-000000000003',
  method: 'grid',
  searchSpace: { lr: { values: [0.1, 0.01] } },
  objective: { metric: 'val_loss', goal: 'minimize', aggregation: 'last' },
  maxTrials: 2,
  parallelism: 1,
  earlyStopping: null,
  seed: 0,
  targetId: null,
  gpuIds: null,
  status: 'finished',
  statusReason: null,
  createdBy: userId,
  createdAt,
  updatedAt: createdAt,
  finishedAt: createdAt,
  trialCounts: { queued: 0, running: 0, finished: 2, failed: 0, canceled: 0, early_stopped: 0, total: 2 },
  bestTrial: null,
} satisfies Sweep;

function trial(index: number): SweepTrial {
  return {
    id: `00000000-0000-4000-8000-${String(200 + index).padStart(12, '0')}`,
    sweepId: sweep.id,
    trialIndex: index,
    parameters: { lr: 0.1 },
    runId: runId(index),
    jobId: `00000000-0000-4000-8000-${String(300 + index).padStart(12, '0')}`,
    state: 'finished',
    objectiveValue: null,
    objectiveStep: null,
    stopReason: null,
    runStatus: 'finished',
    jobStatus: 'finished',
    jobCancelRequested: false,
    createdAt,
    endedAt: createdAt,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function sentRequest(fetch: ReturnType<typeof vi.fn>, index: number) {
  const [url, init] = fetch.mock.calls[index] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined };
}

describe('Run分析のAPI', () => {
  it('表はRun集合・param・metricをそのままbodyに入れてPOSTする', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(emptyTable));
    vi.stubGlobal('fetch', fetch);
    await runAnalysisApi.table('p1', { runSet: { search: { experimentIds: ['e1'] } }, metrics: ['loss'], params: ['lr'] });
    expect(sentRequest(fetch, 0)).toEqual({
      url: '/api/projects/p1/runs/analysis/table',
      method: 'POST',
      body: { runSet: { search: { experimentIds: ['e1'] } }, metrics: ['loss'], params: ['lr'] },
    });
  });

  it('重要度はSweepのときtargetMetricを省いて送れる', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(importance));
    vi.stubGlobal('fetch', fetch);
    await runAnalysisApi.parameterImportance('p1', { runSet: { sweepId: 's1' } });
    expect(sentRequest(fetch, 0)).toEqual({
      url: '/api/projects/p1/runs/analysis/parameter-importance',
      method: 'POST',
      body: { runSet: { sweepId: 's1' } },
    });
  });

  it('APIのエラーコードをそのまま投げ、形の違う応答は不正な応答として扱う', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'x', code: 'too_many_runs' }, 422))
      .mockResolvedValueOnce(jsonResponse({ runs: null }));
    vi.stubGlobal('fetch', fetch);
    await expect(runAnalysisApi.table('p1', { runSet: { runIds: ['a'] }, metrics: ['m'] })).rejects.toMatchObject({
      status: 422,
      code: 'too_many_runs',
    });
    await expect(runAnalysisApi.table('p1', { runSet: { runIds: ['a'] }, metrics: ['m'] })).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('検索のRun集合はmetric名を最初の検索ページから集め、名前順の重複なしで返す', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [run({ loss: 1, acc: 0.5 }, 1), run({ loss: 2 }, 2)],
        nextCursor: null,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const options = await runAnalysisApi.metricOptions('p1', { search: { filter: "params.lr = '0.1'" } });
    expect(options).toEqual({ metricKeys: ['acc', 'loss'], objectiveMetric: null });
    expect(sentRequest(fetch, 0).body).toEqual({ filter: "params.lr = '0.1'", limit: 500 });
  });

  it('Run IDの集合は先頭50件をcompareしてmetric名を集め、1件だけなら問い合わせない', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(comparison([{ namespace: 'params', key: 'lr' }, { namespace: 'metrics', key: 'loss' }])),
    );
    vi.stubGlobal('fetch', fetch);
    const runIds = Array.from({ length: 60 }, (_, index) => `r${index}`);
    await expect(runAnalysisApi.metricOptions('p1', { runIds })).resolves.toEqual({
      metricKeys: ['loss'],
      objectiveMetric: null,
    });
    expect(sentRequest(fetch, 0).body.runIds).toHaveLength(50);
    await expect(runAnalysisApi.metricOptions('p1', { runIds: ['only'] })).resolves.toEqual({
      metricKeys: [],
      objectiveMetric: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('比較したRunが同じSweepの試行なら、そのSweepの目的metricを既定の候補にする', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/sweeps/s1')) return jsonResponse(sweep);
      return jsonResponse(
        comparison([
          { namespace: 'metrics', key: 'system.cpu.percent' },
          { namespace: 'metrics', key: 'val_loss' },
          { namespace: 'metrics', key: 'acc' },
          { namespace: 'tags', key: 'mmt.sweepId', values: ['s1', 's1'] },
        ]),
      );
    });
    vi.stubGlobal('fetch', fetch);
    await expect(runAnalysisApi.metricOptions('p1', { runIds: ['r1', 'r2'] })).resolves.toEqual({
      metricKeys: ['acc', 'val_loss', 'system.cpu.percent'],
      objectiveMetric: null,
      preferredMetric: 'val_loss',
    });
  });

  it('別々のSweepの試行やSweep外のRunが混ざれば目的metricを問い合わせない', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        comparison([
          { namespace: 'metrics', key: 'loss' },
          { namespace: 'tags', key: 'mmt.sweepId', values: ['s1', null] },
        ]),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(runAnalysisApi.metricOptions('p1', { runIds: ['r1', 'r2'] })).resolves.toEqual({
      metricKeys: ['loss'],
      objectiveMetric: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('SweepはobjectiveのmetricをmetricKeysに含めて返す', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/sweeps/s1')) return jsonResponse(sweep);
      if (url.includes('/trials')) return jsonResponse({ items: [trial(1), trial(2)], nextCursor: null });
      return jsonResponse(comparison([{ namespace: 'metrics', key: 'acc' }]));
    });
    vi.stubGlobal('fetch', fetch);
    await expect(runAnalysisApi.metricOptions('p1', { sweepId: 's1' })).resolves.toEqual({
      metricKeys: ['acc', 'val_loss'],
      objectiveMetric: 'val_loss',
    });
  });
});
