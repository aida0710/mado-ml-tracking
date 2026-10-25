import {
  ANALYSIS_MAX_METRICS,
  REPORT_RUN_SET_MAX_RUN_IDS,
  type ReportBlock,
  type ReportBlockSnapshot,
  type ReportBlockType,
  type ReportEmbedBlock,
  type ReportRunSet,
  type ReportSnapshotData,
  type ReportSnapshotRun,
  type RunAnalysisTableRequest,
  type RunSearchRequest,
  type RunSet,
  type SavedViewState,
} from '@mmt/contracts';
import { createPanelConfig, PANEL_HEIGHTS, PANEL_WIDTHS } from './chartPanelLayout';
import { groupChartSeries, runChartSeries, seriesForMetricKeys } from './metricSeries';
import { metricFieldKey, paramFieldKey } from './runAnalysisFields';
import type { MetricsChartSeries } from '../components/charts/chartProps';

// ブロックの一覧の編集と、ライブの埋め込みを描くための要求。純粋な関数で、エディタは一覧を
// stateに持ち、ブロックの表示がこれらの要求をAPIクライアントへ渡す。

export type RunSearchConditions = Omit<RunSearchRequest, 'limit' | 'cursor'>;

/** POST /runs/searchの`filter`の上限（docs/api-contract.md）。 */
export const RUN_SEARCH_FILTER_MAX_LENGTH = 2000;
/** POST /runs/searchの1ページの上限。 */
export const RUN_SEARCH_MAX_LIMIT = 500;

export function isEmbedBlock(block: ReportBlock): block is ReportEmbedBlock {
  return block.type !== 'markdown';
}

/** ブロックを`index`（範囲内に丸める）か末尾に挿入する。 */
export function insertBlock(blocks: readonly ReportBlock[], block: ReportBlock, index = blocks.length): ReportBlock[] {
  const at = Math.max(0, Math.min(index, blocks.length));
  return [...blocks.slice(0, at), block, ...blocks.slice(at)];
}

/** ブロックを`offset`だけ動かす。どちらかの端を越えるときは一覧を変えない。 */
export function moveBlock(blocks: readonly ReportBlock[], blockId: string, offset: number): ReportBlock[] {
  const from = blocks.findIndex((block) => block.id === blockId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= blocks.length) return [...blocks];
  const moved = [...blocks];
  const [block] = moved.splice(from, 1);
  moved.splice(to, 0, block!);
  return moved;
}

export function removeBlock(blocks: readonly ReportBlock[], blockId: string): ReportBlock[] {
  return blocks.filter((block) => block.id !== blockId);
}

/** 同じidのブロックを置き換える。 */
export function replaceBlock(blocks: readonly ReportBlock[], replacement: ReportBlock): ReportBlock[] {
  return blocks.map((block) => (block.id === replacement.id ? replacement : block));
}

/**
 * 選ぶ画面が最初に使う設定での新しいブロック。埋め込みはライブで始める。スナップショットはRunを
 * 追わなくなるので、わざわざ選んだときだけにする。
 */
export function createBlock(type: ReportBlockType, id: string, runSet: ReportRunSet = { runIds: [] }): ReportBlock {
  switch (type) {
    case 'markdown':
      return { id, type, text: '' };
    case 'chart':
      return {
        id,
        type,
        // レポートは1ブロックに1つの図をページ幅いっぱいに描くので、グリッドのセルは固定する。
        panel: { ...createPanelConfig([]), id, layout: { x: 0, y: 0, w: PANEL_WIDTHS.full, h: PANEL_HEIGHTS.normal } },
        runSet,
        mode: 'live',
      };
    case 'parallel_coordinates':
      return { id, type, runSet, params: [], metric: '', mode: 'live' };
    case 'parameter_importance':
      return { id, type, runSet, mode: 'live' };
    case 'scatter':
      return { id, type, runSet, x: '', y: '', mode: 'live' };
    case 'run_table':
      return { id, type, runSet, columns: ['status', 'created'], limit: 50, mode: 'live' };
    case 'media':
      return { id, type, runIds: [], key: '', mode: 'live' };
    case 'media_table':
      return { id, type, runId: '', mediaId: '', mode: 'live' };
  }
}

/** APIは空のstepの一覧を受け付けない。stepが無ければ、メディアの埋め込みは各Runの最新のstepを比べる。 */
export function mediaStepsOrLatest(steps: number[]): number[] | undefined {
  return steps.length ? steps : undefined;
}

/** Runの一覧の保存ビューが表す検索。列と図を除いた条件。 */
export function savedViewSearch(state: SavedViewState): RunSearchConditions {
  return {
    ...(state.experimentIds.length ? { experimentIds: state.experimentIds } : {}),
    ...(state.filter.trim() ? { filter: state.filter } : {}),
    ...(state.orderBy.length ? { orderBy: state.orderBy } : {}),
    ...(state.statuses.length ? { statuses: state.statuses } : {}),
    ...(state.kinds.length ? { kinds: state.kinds } : {}),
  };
}

/**
 * 分析のエンドポイントが受け取るRunの集合。保存ビューはその検索に置き換えるので、ビューを後で
 * 変えると追従する。`savedView`は、前もって読んだビューの状態。
 */
export function toAnalysisRunSet(runSet: ReportRunSet, savedView?: SavedViewState): RunSet {
  if (!('savedViewId' in runSet)) return runSet;
  if (!savedView) throw new Error('The saved view must be read before its Runs');
  return { search: savedViewSearch(savedView) };
}

const quoteFilterValue = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * それぞれRUN_SEARCH_FILTER_MAX_LENGTHに収まるRunのidの絞り込み（`attributes.run_id IN (...)`）。
 * 列挙したRunの集合を、Runの一覧と同じ概要を返す検索で読めるようにする。
 */
export function runIdFilters(runIds: readonly string[]): string[] {
  const prefix = 'attributes.run_id IN (';
  const filters: string[] = [];
  let values: string[] = [];
  const build = (items: string[]) => `${prefix}${items.join(', ')})`;
  for (const runId of runIds) {
    const value = quoteFilterValue(runId);
    if (values.length && build([...values, value]).length > RUN_SEARCH_FILTER_MAX_LENGTH) {
      filters.push(build(values));
      values = [];
    }
    values.push(value);
  }
  if (values.length) filters.push(build(values));
  return filters;
}

/** 系列はRunのidで要求する。APIが1回の要求で受け付けるRunはこの数まで。 */
export const CHART_MAX_RUNS = REPORT_RUN_SET_MAX_RUN_IDS;

/** 散布図か平行座標の裏にある分析の表の、パラメータとメトリクス。 */
export function analysisTableRequest(
  block: Extract<ReportEmbedBlock, { type: 'scatter' | 'parallel_coordinates' }>,
  runSet: RunSet,
): RunAnalysisTableRequest {
  const fields =
    block.type === 'scatter'
      ? [block.x, block.y, ...(block.color ? [block.color] : [])]
      : [...(block.params ?? []).map(paramFieldKey), metricFieldKey(block.metric)];
  const params = unique(fields.filter((key) => key.startsWith('params.')).map((key) => key.slice('params.'.length)));
  const metrics = unique(fields.filter((key) => key.startsWith('metrics.')).map((key) => key.slice('metrics.'.length)));
  return { runSet, ...(params.length ? { params } : {}), metrics: metrics.slice(0, ANALYSIS_MAX_METRICS) };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** 埋め込みをまだ保存できない理由。完成していればnull。i18n/reports.tsのキー。 */
export type ReportBlockProblem =
  | 'runSetEmpty'
  | 'chartMetricsEmpty'
  | 'parallelMetricEmpty'
  | 'parallelParamsEmpty'
  | 'importanceTargetEmpty'
  | 'scatterAxesEmpty'
  | 'scatterMetricMissing'
  | 'mediaRunsEmpty'
  | 'mediaKeyEmpty'
  | 'mediaTableEmpty';

function isRunSetEmpty(runSet: ReportRunSet): boolean {
  if ('runIds' in runSet) return runSet.runIds.length === 0;
  if ('savedViewId' in runSet) return !runSet.savedViewId;
  if ('sweepId' in runSet) return !runSet.sweepId;
  return false;
}

export function reportBlockProblem(block: ReportBlock): ReportBlockProblem | null {
  if ('runSet' in block && isRunSetEmpty(block.runSet)) return 'runSetEmpty';
  switch (block.type) {
    case 'markdown':
      return null;
    case 'chart':
      return block.panel.metricKeys.length ? null : 'chartMetricsEmpty';
    case 'parallel_coordinates':
      if (!block.metric) return 'parallelMetricEmpty';
      // パラメータを省けば分析の表が選ぶ。空の一覧のブロックは正しくない。
      return block.params?.length !== 0 ? null : 'parallelParamsEmpty';
    case 'parameter_importance':
      return block.targetMetric || 'sweepId' in block.runSet ? null : 'importanceTargetEmpty';
    case 'scatter':
      if (!block.x || !block.y) return 'scatterAxesEmpty';
      // 分析の表には少なくとも1つのメトリクスが要る。
      return [block.x, block.y, block.color].some((key) => key?.startsWith('metrics.')) ? null : 'scatterMetricMissing';
    case 'run_table':
      return null;
    case 'media':
      if (!block.runIds.length) return 'mediaRunsEmpty';
      return block.key ? null : 'mediaKeyEmpty';
    case 'media_table':
      return block.runId && block.mediaId ? null : 'mediaTableEmpty';
  }
}

export function snapshotsByBlockId(snapshots: readonly ReportBlockSnapshot[]): Map<string, ReportBlockSnapshot> {
  return new Map(snapshots.map((snapshot) => [snapshot.blockId, snapshot]));
}

/**
 * 保存のときに取り直すスナップショットのブロック。エディタで更新を求めたもののうち、まだ
 * スナップショットのブロックであるもの。変えたブロックはどのみち取り直すので、挙げなくてよい。
 */
export function refreshableSnapshotIds(blocks: readonly ReportBlock[], requested: ReadonlySet<string>): string[] {
  return blocks.filter((block) => isEmbedBlock(block) && block.mode === 'snapshot' && requested.has(block.id)).map((block) => block.id);
}

/** 図の埋め込みの線。図のグリッドと同じ名前を付ける（seriesForMetricKeys）。 */
export function reportChartSeries(
  chart: Extract<ReportSnapshotData, { type: 'chart' }>,
  keys: readonly string[],
): MetricsChartSeries[] {
  const runLabels = snapshotRunLabels(chart.runs);
  return seriesForMetricKeys(keys, (key) =>
    chart.groups ? groupChartSeries(chart.groups, key) : runChartSeries(chart.series ?? [], key, runLabels),
  );
}

/** idごとのRunの名前。図の凡例とメディアのグリッドがRunに付けるラベルと同じ。 */
export function snapshotRunLabels(runs: readonly ReportSnapshotRun[]): Record<string, string> {
  return Object.fromEntries(runs.map((run) => [run.runId, run.name]));
}
