import type { MetricGroupsRequest, MetricGroupsResponse } from '@mmt/contracts';
import { metricSeriesApi } from '../api/metricSeries';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

/**
 * 図のための、Runのグループの平均と最小・最大。nullを渡すと何も取得しない。useMetricSeriesと
 * 同じく、`live`の間はポーリングする。
 */
export function useMetricGroups(
  projectId: string,
  body: MetricGroupsRequest | null,
  live: boolean,
): QueryState<MetricGroupsResponse> {
  return useQuery({
    key: body ? `${projectId}:metric-groups:${JSON.stringify(body)}` : null,
    load: (signal) => metricSeriesApi.groups(projectId, body!, signal),
    pollMs: live ? EXECUTION_POLL_MS : undefined,
  });
}
