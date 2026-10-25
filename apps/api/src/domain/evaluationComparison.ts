import type { MetricComparison, MetricValueSource, MetricValueStatus } from '@mmt/contracts';

// 保存されたとおりに読んだメトリクスの値。valueはNaNや±Infinityのことがあり、compareMetricsは
// それらから差を計算せずにnot_finiteとして返す。
export interface EvaluatedMetricValue {
  value: number;
  source: MetricValueSource;
}
export type EvaluatedMetrics = Readonly<Record<string, EvaluatedMetricValue>>;

interface MetricSide {
  value: number | null;
  status: MetricValueStatus;
  source: MetricValueSource | null;
}

function describeMetric(metric: EvaluatedMetricValue | undefined): MetricSide {
  if (!metric) return { value: null, status: 'missing', source: null };
  if (!Number.isFinite(metric.value))
    return { value: null, status: 'not_finite', source: metric.source };
  return { value: metric.value, status: 'present', source: metric.source };
}

/**
 * 候補とベースラインのメトリクスをkeyでそろえる。metricKeysが無ければ、どちらかで記録された
 * すべてのkeyを名前順に比べる。nullの側（評価のRunが無い）は欠損として扱う。値が大きい方が
 * よいかはここでは決めない。向きは昇格ポリシーが決める。
 */
export function compareMetrics(comparison: {
  candidate: EvaluatedMetrics | null;
  baseline: EvaluatedMetrics | null;
  metricKeys?: readonly string[];
}): MetricComparison[] {
  const candidate = comparison.candidate ?? {};
  const baseline = comparison.baseline ?? {};
  const keys =
    comparison.metricKeys ?? [...new Set([...Object.keys(candidate), ...Object.keys(baseline)])].sort();
  return keys.map((key) => {
    const candidateSide = describeMetric(Object.hasOwn(candidate, key) ? candidate[key] : undefined);
    const baselineSide = describeMetric(Object.hasOwn(baseline, key) ? baseline[key] : undefined);
    const delta =
      candidateSide.value !== null && baselineSide.value !== null
        ? candidateSide.value - baselineSide.value
        : null;
    // |baseline|で割るとdeltaの符号が保たれるので、比が負なら必ず「減った」を意味する。
    const relativeDelta =
      delta !== null && baselineSide.value !== 0 ? delta / Math.abs(baselineSide.value!) : null;
    return {
      key,
      candidate: candidateSide.value,
      baseline: baselineSide.value,
      candidateStatus: candidateSide.status,
      baselineStatus: baselineSide.status,
      delta,
      relativeDelta,
      source: { candidate: candidateSide.source, baseline: baselineSide.source },
    };
  });
}
