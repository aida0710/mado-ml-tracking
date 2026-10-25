import type { ChartXAxis } from '@mmt/contracts';
import { metricSeriesApi } from '../api/metricSeries';
import type { MetricsChartMarker } from '../components/charts/chartProps';
import { resumeMarkers } from '../lib/metricSeries';
import { useQuery, type QueryState } from './useQuery';
import { textTemplates } from '../i18n/catalog';

// resume-eventsはRunごとに1回の要求なので、目印はRunが少ない図にだけ描く。
export const MAX_RESUME_MARKER_RUNS = 10;

/**
 * MetricsChartに出す、Runを再開した位置の縦の目印。MAX_RESUME_MARKER_RUNSより多くのRunの図には、
 * Runごとに1回の要求を送る代わりに、目印を出さない。
 */
export function useResumeMarkers(
  projectId: string,
  runs: readonly { id: string; label: string }[],
  xAxis: ChartXAxis,
): QueryState<MetricsChartMarker[]> {
  const isFewRuns = runs.length > 0 && runs.length <= MAX_RESUME_MARKER_RUNS;
  return useQuery({
    key: isFewRuns
      ? `${projectId}:resume-markers:${xAxis.kind}:${runs.map((run) => run.id).join(',')}`
      : null,
    load: async (signal) =>
      resumeMarkers(
        xAxis,
        await Promise.all(
          runs.map(async (run) => ({
            label: textTemplates.chartResumeMarkerOf(run.label),
            resumeEvents: await metricSeriesApi.resumeEvents(projectId, run.id, signal),
          })),
        ),
      ),
  });
}
