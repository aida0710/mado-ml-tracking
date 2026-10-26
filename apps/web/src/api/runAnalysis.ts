import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import {
  RUN_COMPARISON_MAX_RUNS,
  RUN_COMPARISON_MIN_RUNS,
  type ParameterImportanceRequest,
  type RunAnalysisTableRequest,
  type RunSet,
} from '@mmt/contracts';
import {
  parameterImportanceResultSchema,
  runAnalysisTableResponseSchema,
  runComparisonSchema,
  runSearchPageSchema,
  sweepSchema,
  sweepTrialPageSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';
import { orderAnalysisMetricKeys } from '../lib/runAnalysisFields';
import { SWEEP_ID_TAG } from '../lib/sweepRunTags';

// メトリクスの名前を候補に出すには検索の1ページで足りる。分析ではAPIがすべてのページを読む。
const METRIC_KEY_SAMPLE_RUNS = 500;

/** Runの集合について候補に出すメトリクスの名前と、集合がSweepならその目的関数。 */
export interface RunAnalysisMetricOptions {
  /** 結果のメトリクスを名前順に並べ、その後にシステムメトリクス。 */
  metricKeys: string[];
  objectiveMetric: string | null;
  /**
   * 並べたRunの集合を開いたときのメトリクス。すべてが同じSweepの試行なら、その目的関数にする
   * （Sweepが比べたのは、その最新の値だから）。それ以外はnull。
   */
  preferredMetric?: string | null;
}

interface ComparedKeys {
  metricKeys: string[];
  /** 比べるRunがすべて同じSweepの試行なら、そのSweep。 */
  sweepId: string | null;
}

async function comparedKeys(projectId: string, runIds: string[], signal?: AbortSignal): Promise<ComparedKeys> {
  const sample = runIds.slice(0, RUN_COMPARISON_MAX_RUNS);
  if (sample.length < RUN_COMPARISON_MIN_RUNS) return { metricKeys: [], sweepId: null };
  const comparison = await requestJson(`${projectPath(projectId)}/runs/compare`, {
    schema: runComparisonSchema,
    init: jsonRequestInit('POST', { runIds: sample }, { signal }),
  });
  const sweepIds = new Set(
    comparison.rows.find((row) => row.namespace === 'tags' && row.key === SWEEP_ID_TAG)?.values ?? [null],
  );
  const [sharedSweepId] = sweepIds;
  return {
    metricKeys: comparison.rows.filter((row) => row.namespace === 'metrics').map((row) => row.key),
    sweepId: sweepIds.size === 1 && typeof sharedSweepId === 'string' ? sharedSweepId : null,
  };
}

const sweepPath = (projectId: string, sweepId: string) =>
  `${projectPath(projectId)}/sweeps/${encodeId(sweepId)}`;

async function searchedMetricKeys(
  projectId: string,
  search: Extract<RunSet, { search: unknown }>['search'],
  signal?: AbortSignal,
): Promise<string[]> {
  const page = await requestJson(`${projectPath(projectId)}/runs/search`, {
    schema: runSearchPageSchema,
    init: jsonRequestInit('POST', { ...search, limit: METRIC_KEY_SAMPLE_RUNS }, { signal }),
  });
  return page.items.flatMap((run) => Object.keys(run.latestMetrics));
}

async function sweepMetricOptions(projectId: string, sweepId: string, signal?: AbortSignal) {
  const path = sweepPath(projectId, sweepId);
  const [sweep, trials] = await Promise.all([
    requestJson(path, { schema: sweepSchema, init: { signal } }),
    requestJson(`${path}/trials?limit=${RUN_COMPARISON_MAX_RUNS}`, { schema: sweepTrialPageSchema, init: { signal } }),
  ]);
  const { metricKeys } = await comparedKeys(
    projectId,
    trials.items.map((trial) => trial.runId),
    signal,
  );
  return { metricKeys: [sweep.objective.metric, ...metricKeys], objectiveMetric: sweep.objective.metric };
}

async function listedRunMetricOptions(
  projectId: string,
  runIds: string[],
  signal?: AbortSignal,
): Promise<RunAnalysisMetricOptions> {
  const compared = await comparedKeys(projectId, runIds, signal);
  const metricKeys = orderAnalysisMetricKeys(compared.metricKeys);
  if (!compared.sweepId) return { metricKeys, objectiveMetric: null };
  // Sweepで変わるのは最初の選択だけ。読めない（削除された）Sweepのせいで、Runの分析を
  // 止めてはいけない。
  const sweep = await requestJson(sweepPath(projectId, compared.sweepId), { schema: sweepSchema, init: { signal } }).catch(
    (error: unknown) => {
      if (signal?.aborted) throw error;
      return null;
    },
  );
  return { metricKeys, objectiveMetric: null, preferredMetric: sweep?.objective.metric ?? null };
}

export const runAnalysisApi = {
  table: (projectId: string, body: RunAnalysisTableRequest, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/runs/analysis/table`, {
      schema: runAnalysisTableResponseSchema,
      init: jsonRequestInit('POST', body, { signal }),
    }),
  parameterImportance: (projectId: string, body: ParameterImportanceRequest, signal?: AbortSignal) =>
    requestJson(`${projectPath(projectId)}/runs/analysis/parameter-importance`, {
      schema: parameterImportanceResultSchema,
      init: jsonRequestInit('POST', body, { signal }),
    }),
  /**
   * 分析のエンドポイントは最初にメトリクスの名前が要るので、Runから抜き出す。検索なら最初の
   * ページ、並べたRunなら最大50件（compareで）、SweepならSweepの目的関数と最初の試行から取る。
   * 抜き出した範囲の外のRunにしか無いメトリクスは候補に出ない。
   */
  metricOptions: async (projectId: string, runSet: RunSet, signal?: AbortSignal): Promise<RunAnalysisMetricOptions> => {
    if ('sweepId' in runSet) {
      const options = await sweepMetricOptions(projectId, runSet.sweepId, signal);
      return { ...options, metricKeys: orderAnalysisMetricKeys(options.metricKeys) };
    }
    if ('runIds' in runSet) return listedRunMetricOptions(projectId, runSet.runIds, signal);
    const keys = await searchedMetricKeys(projectId, runSet.search, signal);
    return { metricKeys: orderAnalysisMetricKeys(keys), objectiveMetric: null };
  },
};
