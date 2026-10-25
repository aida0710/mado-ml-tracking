import {
  DEFAULT_SERIES_POINTS,
  MAX_SERIES_KEYS,
  type ChartPanelConfig,
  type ChartXAxis,
  type RunGroupBy,
} from '@mmt/contracts';

// パネルの1ページに要る/metrics/seriesと/metrics/groupsの要求。x軸（とグループ化）が同じパネルは
// 1つの要求を共有するので、1ページの全パネルはたいてい一度に取得できる。

/** パネル1ページでブラウザが受け取る点の数。50個のRun×24個のパネルでも応答よく動く。 */
export const CHART_PAGE_POINT_BUDGET = 200_000;
/** 点がこれより少ないと、長い学習曲線がギザギザに見える。 */
export const MIN_POINTS_PER_SERIES = 100;
/** グループは応答の前には分からない。1ページに出る線がこれを超えることはまれ。 */
const EXPECTED_GROUP_COUNT = 10;

export interface ChartRequestPlan {
  /** 応答を共有できるパネルでは同じ値。 */
  id: string;
  kind: 'series' | 'groups';
  xAxis: ChartXAxis;
  groupBy?: RunGroupBy;
  keys: string[];
}

export function chartRequestPlanId(panel: ChartPanelConfig, groupingEnabled: boolean): string {
  const groupBy = groupingEnabled ? panel.groupBy : undefined;
  return JSON.stringify([
    groupBy ? 'groups' : 'series',
    panel.xAxis.kind,
    panel.xAxis.metricKey ?? null,
    groupBy?.kind ?? null,
    groupBy?.key ?? null,
  ]);
}

/**
 * x軸とグループ化の組ごとに1つの計画。`groupingEnabled`が無いとき（Runが1つ）は、保存された
 * パネルのグループ化を無視し、Runを1つずつ描く。
 */
export function planChartRequests(
  panels: readonly ChartPanelConfig[],
  groupingEnabled: boolean,
): ChartRequestPlan[] {
  const plans = new Map<string, ChartRequestPlan>();
  for (const panel of panels) {
    const id = chartRequestPlanId(panel, groupingEnabled);
    const groupBy = groupingEnabled ? panel.groupBy : undefined;
    const plan = plans.get(id) ?? {
      id,
      kind: groupBy ? 'groups' : 'series',
      xAxis: panel.xAxis,
      ...(groupBy ? { groupBy } : {}),
      keys: [],
    };
    for (const key of panel.metricKeys) if (!plan.keys.includes(key)) plan.keys.push(key);
    plans.set(id, plan);
  }
  return [...plans.values()];
}

/** APIが1回の要求で受けるキーはMAX_SERIES_KEYS個まで。 */
export function chunkMetricKeys(keys: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < keys.length; index += MAX_SERIES_KEYS)
    chunks.push(keys.slice(index, index + MAX_SERIES_KEYS));
  return chunks;
}

/** ページのすべての線がCHART_PAGE_POINT_BUDGETに収まる、系列あたりの点の数。 */
export function pointsPerSeries(lineCount: number): number {
  const share = Math.floor(CHART_PAGE_POINT_BUDGET / Math.max(1, lineCount));
  return Math.max(MIN_POINTS_PER_SERIES, Math.min(DEFAULT_SERIES_POINTS, share));
}

export function maxPointsForPlan(plan: ChartRequestPlan, runCount: number): number {
  const lines = (plan.kind === 'groups' ? EXPECTED_GROUP_COUNT : runCount) * plan.keys.length;
  return pointsPerSeries(lines);
}
