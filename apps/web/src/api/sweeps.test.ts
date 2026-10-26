import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@mado/design-system/http';
import type { Sweep, SweepCreate, SweepTrial } from '@mmt/contracts';
import { sweepsApi } from './sweeps';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const createdAt = '2026-10-08T00:00:00.000Z';
const SWEEP_ID = '00000000-0000-4000-8000-000000000001';
const sweep: Sweep = {
  id: SWEEP_ID,
  projectId: '00000000-0000-4000-8000-000000000002',
  name: 'lr-search',
  taskId: '00000000-0000-4000-8000-000000000003',
  taskRevision: 1,
  experimentId: '00000000-0000-4000-8000-000000000004',
  method: 'grid',
  searchSpace: { lr: { values: [0.1, 0.01] } },
  objective: { metric: 'val_loss', goal: 'minimize', aggregation: 'last' },
  maxTrials: 4,
  parallelism: 2,
  earlyStopping: null,
  seed: 0,
  targetId: null,
  gpuIds: null,
  status: 'running',
  statusReason: null,
  createdBy: '00000000-0000-4000-8000-000000000005',
  createdAt,
  updatedAt: createdAt,
  finishedAt: null,
  trialCounts: { queued: 0, running: 0, finished: 0, failed: 0, canceled: 0, early_stopped: 0, total: 0 },
  bestTrial: null,
};
// 試行番号ごとに別のidを付ける（末尾の12桁が試行番号）。
const trial = (trialIndex: number): SweepTrial => ({
  id: `00000000-0000-4000-9000-${String(trialIndex).padStart(12, '0')}`,
  sweepId: SWEEP_ID,
  trialIndex,
  parameters: { lr: 0.1 },
  runId: `00000000-0000-4000-a000-${String(trialIndex).padStart(12, '0')}`,
  jobId: `00000000-0000-4000-b000-${String(trialIndex).padStart(12, '0')}`,
  state: 'finished',
  objectiveValue: 0.5,
  objectiveStep: 10,
  stopReason: null,
  runStatus: 'finished',
  jobStatus: 'finished',
  jobCancelRequested: false,
  createdAt,
  endedAt: createdAt,
});

afterEach(() => vi.unstubAllGlobals());

describe('Sweep APIのpathとbody', () => {
  it('一覧は状態とcursorをqueryに付け、未指定なら付けない', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ items: [], nextCursor: null })));
    vi.stubGlobal('fetch', fetch);
    await sweepsApi.list('project', { status: 'paused', cursor: 'next' });
    await sweepsApi.list('project');
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/projects/project/sweeps?status=paused&cursor=next',
      '/api/projects/project/sweeps',
    ]);
  });

  it('作成は入力をそのままPOSTする', async () => {
    const fetch = vi.fn().mockResolvedValue(json(sweep, 201));
    vi.stubGlobal('fetch', fetch);
    const input: SweepCreate = {
      name: 'lr-search',
      taskId: 'task',
      method: 'grid',
      searchSpace: { lr: { values: [0.1, 0.01] } },
      objective: { metric: 'val_loss', goal: 'minimize', aggregation: 'last' },
      maxTrials: 4,
      parallelism: 2,
      earlyStopping: null,
      targetId: null,
      gpuIds: null,
    };
    await sweepsApi.create('project', input);
    const [path, options] = fetch.mock.calls[0]!;
    expect([path, options.method, JSON.parse(options.body)]).toEqual(['/api/projects/project/sweeps', 'POST', input]);
  });

  it('pause・resume・cancel・PATCHはSweepごとのpathへ送り、cancelは実行中の扱いをbodyに入れる', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(sweep)));
    vi.stubGlobal('fetch', fetch);
    await sweepsApi.pause('project', 'sweep/1');
    await sweepsApi.resume('project', 'sweep/1');
    await sweepsApi.cancel('project', 'sweep/1', { cancelRunningTrials: true });
    await sweepsApi.update('project', 'sweep/1', { parallelism: 3 });
    expect(fetch.mock.calls.map(([path, options]) => [path, options.method, options.body && JSON.parse(options.body)])).toEqual([
      ['/api/projects/project/sweeps/sweep%2F1/pause', 'POST', undefined],
      ['/api/projects/project/sweeps/sweep%2F1/resume', 'POST', undefined],
      ['/api/projects/project/sweeps/sweep%2F1/cancel', 'POST', { cancelRunningTrials: true }],
      ['/api/projects/project/sweeps/sweep%2F1', 'PATCH', { parallelism: 3 }],
    ]);
  });

  it('全試行の取得はnextCursorを辿って試行番号順の全ページをつなぐ', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ items: [trial(0)], nextCursor: 'page-2' }))
      .mockResolvedValueOnce(json({ items: [trial(1)], nextCursor: null }));
    vi.stubGlobal('fetch', fetch);
    const trials = await sweepsApi.allTrials('project', 'sweep');
    expect(trials.map((trial) => trial.trialIndex)).toEqual([0, 1]);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/projects/project/sweeps/sweep/trials?orderBy=trial_index&limit=500',
      '/api/projects/project/sweeps/sweep/trials?orderBy=trial_index&limit=500&cursor=page-2',
    ]);
  });

  it('同じcursorを返し続ける応答では無限に読まずに止まる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json({ items: [], nextCursor: 'same' }))));
    await expect(sweepsApi.allTrials('project', 'sweep')).resolves.toEqual([]);
  });

  it('nextCursorの欠けたページは契約違反として扱う', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ items: [] })));
    await expect(sweepsApi.list('project')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('探索空間の422はcodeとサーバーのmessage、横の項目を保って返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      error: 'parameter "lr" requires min < max (min=1, max=0)',
      code: 'sweep_space_invalid',
      reason: 'range_order',
      parameter: 'lr',
      min: '1',
      max: '0',
    }, 422)));
    const failure = await sweepsApi.create('project', {} as SweepCreate).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('sweep_space_invalid');
    expect((failure as ApiError).message).toContain('"lr"');
    expect((failure as ApiError).details).toEqual({ reason: 'range_order', parameter: 'lr', min: '1', max: '0' });
  });

  it('目的メトリクスの重ね描きは試行RunのstepをPOST /metrics/seriesで読む', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ series: [] }));
    vi.stubGlobal('fetch', fetch);
    await sweepsApi.objectiveSeries('project', { runIds: ['run-1', 'run-2'], metric: 'val_loss' });
    const [path, options] = fetch.mock.calls[0]!;
    expect([path, options.method, JSON.parse(options.body)]).toEqual([
      '/api/projects/project/metrics/series',
      'POST',
      { runIds: ['run-1', 'run-2'], keys: ['val_loss'], xAxis: { kind: 'step' } },
    ]);
  });
});
