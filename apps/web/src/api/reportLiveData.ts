import {
  DEFAULT_SERIES_POINTS,
  type ReportEmbedBlock,
  type ReportRunSet,
  type ReportSnapshotData,
  type Run,
  type RunSet,
} from '@mmt/contracts';
import { metricSeriesApi } from './metricSeries';
import { runAnalysisApi } from './runAnalysis';
import { runMediaApi } from './runMedia';
import { savedViewsApi } from './savedViews';
import { sweepsApi } from './sweeps';
import { trackingApi } from './tracking';
import {
  analysisTableRequest,
  CHART_MAX_RUNS,
  RUN_SEARCH_MAX_LIMIT,
  runIdFilters,
  toAnalysisRunSet,
} from '../lib/reportBlocks';

// 最新データの埋め込みが描くものを、読む人自身の権限で読む。保存したスナップショットと同じ形にして、
// 1つの表示で両方を描けるようにする。メディアの表はAPIを自分でページ送りするので、ここでは読まない。

type LiveBlock = Exclude<ReportEmbedBlock, { type: 'media_table' }>;

/** ブロックのRunの集合。保存ビューは今の検索条件に置き換える。 */
async function resolveRunSet(projectId: string, runSet: ReportRunSet, signal: AbortSignal): Promise<RunSet> {
  if (!('savedViewId' in runSet)) return runSet;
  const view = await savedViewsApi.get(projectId, runSet.savedViewId, signal);
  return toAnalysisRunSet(runSet, view.state);
}

async function runsByIds(projectId: string, runIds: string[], signal: AbortSignal): Promise<Run[]> {
  const pages = await Promise.all(
    runIdFilters(runIds).map((filter) =>
      trackingApi.searchRuns(projectId, { filter, limit: RUN_SEARCH_MAX_LIMIT }, signal),
    ),
  );
  // レポートに並べた順を保つ。削除されたRunや見えないRunは単に抜ける。
  const byId = new Map(pages.flatMap((page) => page.items).map((run) => [run.id, run]));
  return runIds.flatMap((runId) => byId.get(runId) ?? []);
}

/** 集合のRunを最大`limit`件返す。並べた順、検索の順、またはSweepの新しい試行から。 */
async function listRuns(projectId: string, runSet: RunSet, limit: number, signal: AbortSignal): Promise<Run[]> {
  if ('runIds' in runSet) return runsByIds(projectId, runSet.runIds.slice(0, limit), signal);
  if ('search' in runSet) {
    const page = await trackingApi.searchRuns(projectId, { ...runSet.search, limit }, signal);
    return page.items;
  }
  const trials = await sweepsApi.allTrials(projectId, runSet.sweepId, signal);
  const newest = [...trials].sort((left, right) => right.trialIndex - left.trialIndex).slice(0, limit);
  return runsByIds(projectId, newest.map((trial) => trial.runId), signal);
}

const snapshotRunsOf = (runs: Run[]) => runs.map((run) => ({ runId: run.id, name: run.name }));

async function loadChart(
  projectId: string,
  block: Extract<LiveBlock, { type: 'chart' }>,
  runSet: RunSet,
  signal: AbortSignal,
): Promise<ReportSnapshotData> {
  const { panel } = block;
  const common = { keys: panel.metricKeys, xAxis: panel.xAxis, maxPoints: DEFAULT_SERIES_POINTS };
  if (panel.groupBy) {
    const request = { groupBy: panel.groupBy, ...common };
    // グループは検索条件をそのまま受け取る。並べたRunとSweepの試行はidでグループにする。
    if ('search' in runSet) {
      const response = await metricSeriesApi.groups(projectId, { search: runSet.search, ...request }, signal);
      return { type: 'chart', runs: [], groups: response.groups };
    }
    const runIds = (await listRuns(projectId, runSet, CHART_MAX_RUNS, signal)).map((run) => run.id);
    if (!runIds.length) return { type: 'chart', runs: [], groups: [] };
    const response = await metricSeriesApi.groups(projectId, { runIds, ...request }, signal);
    return { type: 'chart', runs: [], groups: response.groups };
  }
  const runs = await listRuns(projectId, runSet, CHART_MAX_RUNS, signal);
  if (!runs.length) return { type: 'chart', runs: [], series: [] };
  const response = await metricSeriesApi.series(projectId, { runIds: runs.map((run) => run.id), ...common }, signal);
  return { type: 'chart', runs: snapshotRunsOf(runs), series: response.series };
}

export async function loadLiveBlockData(
  projectId: string,
  block: LiveBlock,
  signal: AbortSignal,
): Promise<ReportSnapshotData> {
  if (block.type === 'media') {
    const [grid, runs] = await Promise.all([
      runMediaApi.compare(
        projectId,
        { runIds: block.runIds, key: block.key, ...(block.steps ? { steps: block.steps } : {}) },
        signal,
      ),
      runsByIds(projectId, block.runIds, signal),
    ]);
    return { type: 'media', runs: snapshotRunsOf(runs), grid };
  }
  const runSet = await resolveRunSet(projectId, block.runSet, signal);
  switch (block.type) {
    case 'chart':
      return loadChart(projectId, block, runSet, signal);
    case 'parallel_coordinates':
    case 'scatter':
      return { type: block.type, table: await runAnalysisApi.table(projectId, analysisTableRequest(block, runSet), signal) };
    case 'parameter_importance':
      return {
        type: 'parameter_importance',
        importance: await runAnalysisApi.parameterImportance(
          projectId,
          { runSet, ...(block.targetMetric ? { targetMetric: block.targetMetric } : {}) },
          signal,
        ),
      };
    case 'run_table':
      return { type: 'run_table', runs: await listRuns(projectId, runSet, block.limit, signal) };
  }
}

// 集合全体を読まずに、集合で使われている名前を候補に出せるだけのRunの数。
const RUN_SET_SAMPLE_SIZE = 200;

/** 集合の先頭のRun。埋め込みの選択欄は、ここからメトリクス・パラメータ・タグの名前を候補に出す。 */
export async function loadRunSetSample(projectId: string, runSet: ReportRunSet, signal: AbortSignal): Promise<Run[]> {
  return listRuns(projectId, await resolveRunSet(projectId, runSet, signal), RUN_SET_SAMPLE_SIZE, signal);
}
