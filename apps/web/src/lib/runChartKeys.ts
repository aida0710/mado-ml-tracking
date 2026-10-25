import { RUN_NOTE_TAG, type Run } from '@mmt/contracts';
import { getRunParameters } from './runParameters';
import { isSystemMetricKey } from './systemMetricKeys';

/**
 * 複数のRunの図に出せるもの。メトリクス（システムメトリクスには専用のタブがある）と、グループ
 * 分けに使うタグとパラメータ。Runの説明のタグは長いMarkdownなので、グループにはしない。
 */
export function getRunChartKeys(runs: readonly Run[]) {
  const collect = (keysOf: (run: Run) => string[]) =>
    [...new Set(runs.flatMap(keysOf))].sort((left, right) => left.localeCompare(right));
  return {
    metricKeys: collect((run) => Object.keys(run.latestMetrics).filter((key) => !isSystemMetricKey(key))),
    tagKeys: collect((run) => Object.keys(run.tags).filter((key) => key !== RUN_NOTE_TAG)),
    paramKeys: collect((run) => Object.keys(getRunParameters(run))),
  };
}
