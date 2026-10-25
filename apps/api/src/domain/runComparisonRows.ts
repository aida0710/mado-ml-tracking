import type { Run, RunComparisonRow, RunComparisonValue } from '@mmt/contracts';
import { compareMetrics, type EvaluatedMetrics } from './evaluationComparison.js';
import { getRunParameterCells, parseMetricValue } from './runTableCells.js';

const sortedKeys = (records: readonly Record<string, unknown>[]) =>
  [...new Set(records.flatMap((record) => Object.keys(record)))].sort();

function namespaceRows(
  namespace: RunComparisonRow['namespace'],
  records: readonly Record<string, RunComparisonValue>[],
): RunComparisonRow[] {
  return sortedKeys(records).map((key) => ({
    namespace,
    key,
    values: records.map((record) => (Object.hasOwn(record, key) ? record[key]! : null)),
  }));
}

function evaluatedMetrics(run: Run): EvaluatedMetrics {
  const metrics: Record<string, { value: number; source: 'run_latest' }> = {};
  for (const [key, raw] of Object.entries(run.latestMetrics)) {
    const value = parseMetricValue(raw);
    if (value !== null) metrics[key] = { value, source: 'run_latest' };
  }
  return metrics;
}

/**
 * Runのparameter、メトリクス、tagを並べる（Runごとに値を1つ、渡された順に）。メトリクスの行は
 * metricKeysがあればそれに従い、無ければ記録されたすべてのkeyを名前順に出す。ベースラインが
 * あれば、評価の比較と同じ方法で計算した各Runとの差も持たせる。
 */
export function buildComparisonRows(comparison: {
  runs: readonly Run[];
  baselineRunId: string | null;
  metricKeys: readonly string[] | null;
}): RunComparisonRow[] {
  const { runs, baselineRunId } = comparison;
  const metricKeys = comparison.metricKeys ?? sortedKeys(runs.map((run) => run.latestMetrics));
  const metricRows: RunComparisonRow[] = metricKeys.map((key) => ({
    namespace: 'metrics',
    key,
    values: runs.map((run) =>
      Object.hasOwn(run.latestMetrics, key) ? run.latestMetrics[key]! : null,
    ),
  }));
  const baseline = runs.find((run) => run.id === baselineRunId);
  if (baseline) {
    const baselineMetrics = evaluatedMetrics(baseline);
    // compareMetricsはRunごとに全keyの結果を返す。行にするには転置が要る。
    const differences = runs.map((run) =>
      compareMetrics({
        candidate: evaluatedMetrics(run),
        baseline: baselineMetrics,
        metricKeys,
      }),
    );
    metricRows.forEach((row, keyIndex) => {
      row.deltaFromBaseline = differences.map((perKey) => perKey[keyIndex]!.delta);
      row.relativeDeltaFromBaseline = differences.map((perKey) => perKey[keyIndex]!.relativeDelta);
    });
  }
  return [
    ...namespaceRows('params', runs.map(getRunParameterCells)),
    ...metricRows,
    ...namespaceRows(
      'tags',
      runs.map((run) => run.tags),
    ),
  ];
}
