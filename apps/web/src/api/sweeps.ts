import type {
  MetricSeries,
  MetricSeriesResponse,
  Sweep,
  SweepCancel,
  SweepCreate,
  SweepPage,
  SweepPatch,
  SweepStatus,
  SweepTrial,
  SweepTrialPage,
} from '@mmt/contracts';
import { assertCursorPage, encodeId, invalidResponseError, jsonRequest, projectPath, request } from './http';

// 試行のページのAPIの上限（docs/api-contract.mdのSweeps）。Sweepの詳細はすべての試行を読む。
const TRIAL_PAGE_SIZE = 500;
// 終わらないcursorで、いつまでも繰り返さないための上限。
const MAX_TRIAL_PAGES = 100;

const sweepPath = (projectId: string, sweepId?: string) =>
  `${projectPath(projectId)}/sweeps${sweepId ? `/${encodeId(sweepId)}` : ''}`;

function assertSweep(sweep: Sweep): Sweep {
  if (typeof sweep.id !== 'string' || typeof sweep.trialCounts !== 'object' || sweep.trialCounts === null)
    throw invalidResponseError();
  return sweep;
}

export const sweepsApi = {
  list: async (
    projectId: string,
    { status, cursor, signal }: { status?: SweepStatus; cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (cursor) query.set('cursor', cursor);
    const search = query.toString();
    const page = await request<SweepPage>(`${sweepPath(projectId)}${search ? `?${search}` : ''}`, { signal });
    assertCursorPage(page);
    return page;
  },
  get: async (projectId: string, sweepId: string, signal?: AbortSignal) =>
    assertSweep(await request<Sweep>(sweepPath(projectId, sweepId), { signal })),
  trialPage: async (
    projectId: string,
    sweepId: string,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams({ orderBy: 'trial_index', limit: String(TRIAL_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    const page = await request<SweepTrialPage>(`${sweepPath(projectId, sweepId)}/trials?${query}`, { signal });
    assertCursorPage(page);
    return page;
  },
  /** すべての試行を試行の順に返す。nextCursorをたどる。 */
  allTrials: async (projectId: string, sweepId: string, signal?: AbortSignal) => {
    const trials: SweepTrial[] = [];
    let cursor: string | undefined;
    for (let pageCount = 0; pageCount < MAX_TRIAL_PAGES; pageCount++) {
      const page = await sweepsApi.trialPage(projectId, sweepId, { cursor, signal });
      trials.push(...page.items);
      if (!page.nextCursor || page.nextCursor === cursor) return trials;
      cursor = page.nextCursor;
    }
    throw invalidResponseError();
  },
  create: async (projectId: string, input: SweepCreate) =>
    assertSweep(await request<Sweep>(sweepPath(projectId), jsonRequest('POST', input))),
  pause: (projectId: string, sweepId: string) =>
    request<Sweep>(`${sweepPath(projectId, sweepId)}/pause`, { method: 'POST' }),
  resume: (projectId: string, sweepId: string) =>
    request<Sweep>(`${sweepPath(projectId, sweepId)}/resume`, { method: 'POST' }),
  cancel: (projectId: string, sweepId: string, input: SweepCancel) =>
    request<Sweep>(`${sweepPath(projectId, sweepId)}/cancel`, jsonRequest('POST', input)),
  update: (projectId: string, sweepId: string, input: SweepPatch) =>
    request<Sweep>(sweepPath(projectId, sweepId), jsonRequest('PATCH', input)),
  /** 重ねて描くための、試行のRunの目的関数のstepごとの値（POST /metrics/series）。 */
  objectiveSeries: async (
    projectId: string,
    { runIds, metric, signal }: { runIds: string[]; metric: string; signal?: AbortSignal },
  ): Promise<MetricSeries[]> => {
    const response = await request<MetricSeriesResponse>(
      `${projectPath(projectId)}/metrics/series`,
      { ...jsonRequest('POST', { runIds, keys: [metric], xAxis: { kind: 'step' } }), signal },
    );
    if (!Array.isArray(response.series)) throw invalidResponseError();
    return response.series;
  },
};
