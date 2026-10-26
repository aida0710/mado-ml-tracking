import { ApiError, INVALID_RESPONSE_CODE, jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { SweepCancel, SweepCreate, SweepPatch, SweepStatus, SweepTrial } from '@mmt/contracts';
import {
  metricSeriesResponseSchema,
  sweepPageSchema,
  sweepSchema,
  sweepTrialPageSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

// 試行のページのAPIの上限（docs/api-contract.mdのSweeps）。Sweepの詳細はすべての試行を読む。
const TRIAL_PAGE_SIZE = 500;
// 終わらないcursorで、いつまでも繰り返さないための上限。
const MAX_TRIAL_PAGES = 100;

const sweepPath = (projectId: string, sweepId?: string) =>
  `${projectPath(projectId)}/sweeps${sweepId ? `/${encodeId(sweepId)}` : ''}`;

export const sweepsApi = {
  list: (
    projectId: string,
    { status, cursor, signal }: { status?: SweepStatus; cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (cursor) query.set('cursor', cursor);
    const search = query.toString();
    return requestJson(`${sweepPath(projectId)}${search ? `?${search}` : ''}`, {
      schema: sweepPageSchema,
      init: { signal },
    });
  },
  get: (projectId: string, sweepId: string, signal?: AbortSignal) =>
    requestJson(sweepPath(projectId, sweepId), { schema: sweepSchema, init: { signal } }),
  trialPage: (
    projectId: string,
    sweepId: string,
    { cursor, signal }: { cursor?: string; signal?: AbortSignal } = {},
  ) => {
    const query = new URLSearchParams({ orderBy: 'trial_index', limit: String(TRIAL_PAGE_SIZE) });
    if (cursor) query.set('cursor', cursor);
    return requestJson(`${sweepPath(projectId, sweepId)}/trials?${query}`, {
      schema: sweepTrialPageSchema,
      init: { signal },
    });
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
    throw new ApiError({
      status: 200,
      code: INVALID_RESPONSE_CODE,
      message: `The trials of sweep ${sweepId} did not end within ${MAX_TRIAL_PAGES} pages`,
    });
  },
  create: (projectId: string, input: SweepCreate) =>
    requestJson(sweepPath(projectId), { schema: sweepSchema, init: jsonRequestInit('POST', input) }),
  pause: (projectId: string, sweepId: string) =>
    requestJson(`${sweepPath(projectId, sweepId)}/pause`, { schema: sweepSchema, init: { method: 'POST' } }),
  resume: (projectId: string, sweepId: string) =>
    requestJson(`${sweepPath(projectId, sweepId)}/resume`, { schema: sweepSchema, init: { method: 'POST' } }),
  cancel: (projectId: string, sweepId: string, input: SweepCancel) =>
    requestJson(`${sweepPath(projectId, sweepId)}/cancel`, { schema: sweepSchema, init: jsonRequestInit('POST', input) }),
  update: (projectId: string, sweepId: string, input: SweepPatch) =>
    requestJson(sweepPath(projectId, sweepId), { schema: sweepSchema, init: jsonRequestInit('PATCH', input) }),
  /** 重ねて描くための、試行のRunの目的関数のstepごとの値（POST /metrics/series）。 */
  objectiveSeries: async (
    projectId: string,
    { runIds, metric, signal }: { runIds: string[]; metric: string; signal?: AbortSignal },
  ) =>
    (
      await requestJson(`${projectPath(projectId)}/metrics/series`, {
        schema: metricSeriesResponseSchema,
        init: { ...jsonRequestInit('POST', { runIds, keys: [metric], xAxis: { kind: 'step' } }), signal },
      })
    ).series,
};
