import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { MetricGroupsRequest, MetricSeriesRequest } from '@mmt/contracts';
import {
  metricGroupsResponseSchema,
  metricSeriesResponseSchema,
  runResumeEventPageSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

/** 図のために間引いたメトリクスの系列と、図がx軸に印を付ける再開のイベント。 */
export const metricSeriesApi = {
  series: (projectId: string, body: MetricSeriesRequest, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/metrics/series`, {
      schema: metricSeriesResponseSchema,
      init: { ...jsonRequestInit('POST', body), signal },
    }),
  groups: (projectId: string, body: MetricGroupsRequest, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/metrics/groups`, {
      schema: metricGroupsResponseSchema,
      init: { ...jsonRequestInit('POST', body), signal },
    }),
  resumeEvents: (projectId: string, runId: string, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/runs/${encodeId(runId)}/resume-events`, {
      schema: runResumeEventPageSchema,
      init: { signal },
    }),
};
