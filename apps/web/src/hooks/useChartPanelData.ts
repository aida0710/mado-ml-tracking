import type {
  MetricGroup,
  MetricGroupsRequest,
  MetricSeries,
  MetricXRange,
} from '@mmt/contracts';
import { metricSeriesApi } from '../api/metricSeries';
import { chunkMetricKeys, maxPointsForPlan, type ChartRequestPlan } from '../lib/chartPanelRequests';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * ページが描くRun。系列は常にidで取得する。グループ化したパネルは、ページに検索があれば`search`を
 * 送り、一覧に出ているRunだけでなく検索全体をグループにまとめる。
 */
export interface ChartRunSource {
  runIds: string[];
  search?: MetricGroupsRequest['search'];
}

export type ChartPlanData =
  | { kind: 'series'; series: MetricSeries[] }
  | { kind: 'groups'; groups: MetricGroup[] };

async function loadPlan(
  projectId: string,
  source: ChartRunSource,
  plan: ChartRequestPlan,
  xRange: MetricXRange | undefined,
  signal: AbortSignal,
): Promise<ChartPlanData> {
  const maxPoints = maxPointsForPlan(plan, source.runIds.length);
  const range = xRange ? { xRange } : {};
  if (plan.kind === 'series') {
    // グループ化したページは、検索があっても一覧のRunが無いことがある。APIは空のidの一覧を受け付けない。
    if (!source.runIds.length) return { kind: 'series', series: [] };
    const responses = await Promise.all(
      chunkMetricKeys(plan.keys).map((keys) =>
        metricSeriesApi.series(
          projectId,
          { runIds: source.runIds, keys, xAxis: plan.xAxis, maxPoints, ...range },
          signal,
        ),
      ),
    );
    return { kind: 'series', series: responses.flatMap((response) => response.series) };
  }
  const runs = source.search ? { search: source.search } : { runIds: source.runIds };
  const responses = await Promise.all(
    chunkMetricKeys(plan.keys).map((keys) =>
      metricSeriesApi.groups(
        projectId,
        { ...runs, groupBy: plan.groupBy!, keys, xAxis: plan.xAxis, maxPoints, ...range },
        signal,
      ),
    ),
  );
  // キーの塊ごとに同じグループが返るので、系列をグループごとにつなぐ。
  const groups = new Map<string, MetricGroup>();
  for (const group of responses.flatMap((response) => response.groups)) {
    const known = groups.get(group.groupKey);
    groups.set(group.groupKey, known ? { ...known, series: [...known.series, ...group.series] } : group);
  }
  return { kind: 'groups', groups: [...groups.values()] };
}

/** 要求の計画ごとに1つの応答（計画のidがキー）。描いているRunのどれかが実行中の間はポーリングする。 */
export function useChartPanelData({
  projectId,
  source,
  plans,
  xRange,
  live,
}: {
  projectId: string;
  source: ChartRunSource;
  plans: ChartRequestPlan[];
  xRange?: MetricXRange;
  live: boolean;
}) {
  const hasRuns = source.runIds.length > 0 || source.search !== undefined;
  const key =
    hasRuns && plans.length ? JSON.stringify(['chart-panels', projectId, source, plans, xRange ?? null]) : null;
  return useQuery({
    key,
    load: async (signal) => {
      const loaded = await Promise.all(
        plans.map(async (plan) => [plan.id, await loadPlan(projectId, source, plan, xRange, signal)] as const),
      );
      return Object.fromEntries(loaded) as Record<string, ChartPlanData>;
    },
    pollMs: live ? EXECUTION_POLL_MS : undefined,
  });
}
