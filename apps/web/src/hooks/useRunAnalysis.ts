import type { RunSet } from '@mmt/contracts';
import { runAnalysisApi } from '../api/runAnalysis';
import { resolveAnalysisTarget, tableMetricKeys, type AnalysisTarget } from '../lib/runAnalysisFields';
import { useQuery } from './useQuery';

/**
 * 1つの対象のRunについての、パラメータ×メトリクスの表とパラメータの重要度。どちらの
 * エンドポイントもメトリクス名が要るので、先にそれをサンプリングする。`chosenTarget`が
 * 対象のRunに無ければ、既定のものを使う。
 */
export function useRunAnalysis({
  projectId,
  runSet,
  chosenTarget,
}: {
  projectId: string;
  runSet: RunSet;
  chosenTarget: AnalysisTarget | null;
}) {
  const runSetKey = `${projectId}:run-analysis:${JSON.stringify(runSet)}`;
  const metricOptions = useQuery({ key: runSetKey, load: (signal) => runAnalysisApi.metricOptions(projectId, runSet, signal) });
  const target = metricOptions.value ? resolveAnalysisTarget(chosenTarget, metricOptions.value) : null;
  const metrics = metricOptions.value ? tableMetricKeys(metricOptions.value.metricKeys, target) : [];
  const table = useQuery({
    // メトリクスの集まりをキーにして、その中で別の指標を選んでも表を読み直さないようにする。
    key: metrics.length > 0 ? `${runSetKey}:table:${JSON.stringify([...metrics].sort())}` : null,
    load: (signal) => runAnalysisApi.table(projectId, { runSet, metrics }, signal),
  });
  const importance = useQuery({
    key: target ? `${runSetKey}:importance:${JSON.stringify(target)}` : null,
    load: (signal) =>
      runAnalysisApi.parameterImportance(
        projectId,
        { runSet, ...(target?.source === 'latest_metric' ? { targetMetric: target.metric } : {}) },
        signal,
      ),
  });
  return { metricOptions, target, table, importance };
}
