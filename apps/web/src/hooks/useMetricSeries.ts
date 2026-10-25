import type { MetricSeriesRequest, MetricSeriesResponse } from '@mmt/contracts';
import { metricSeriesApi } from '../api/metricSeries';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

/**
 * 図のための、Runのサンプリングした系列。nullを渡すと何も取得しない。`live`（実行中のRunがある）の
 * 間はポーリングし、すべてのRunが終わったら止める。拡大はxRangeを付けた新しい要求になる。
 */
export function useMetricSeries(
  projectId: string,
  body: MetricSeriesRequest | null,
  live: boolean,
): QueryState<MetricSeriesResponse> {
  return useQuery({
    key: body ? `${projectId}:metric-series:${JSON.stringify(body)}` : null,
    load: (signal) => metricSeriesApi.series(projectId, body!, signal),
    pollMs: live ? EXECUTION_POLL_MS : undefined,
  });
}
