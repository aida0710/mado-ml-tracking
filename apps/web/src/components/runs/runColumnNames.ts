import type { Run } from '@mmt/contracts';
import { getRunParameters } from '../../lib/runParameters';

// 最初の列に学習の結果が出るよう、実験のメトリクスをシステムメトリクスより前に置く。
const SYSTEM_METRIC_PREFIX = 'system.';

/** 出ているRunにあるメトリクスとパラメータの名前。列の順に並べる。 */
export function getRunColumnNames(runs: Run[]): {
  metricNames: string[];
  parameterNames: string[];
} {
  const parameterNames = Array.from(
    new Set(runs.flatMap((run) => Object.keys(getRunParameters(run)))),
  ).sort();
  const metricNames = Array.from(
    new Set(runs.flatMap((run) => Object.keys(run.latestMetrics))),
  ).sort(
    (left, right) =>
      Number(left.startsWith(SYSTEM_METRIC_PREFIX)) -
        Number(right.startsWith(SYSTEM_METRIC_PREFIX)) || left.localeCompare(right),
  );
  return { metricNames, parameterNames };
}
