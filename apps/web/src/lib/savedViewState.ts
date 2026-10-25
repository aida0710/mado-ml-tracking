import type {
  ChartPanelLayout,
  RunGroupBy,
  RunKind,
  RunStatus,
  SavedViewColumn,
  SavedViewState,
} from '@mmt/contracts';
import { emptyChartPanelLayout, parseChartPanelLayout, setPanelsGroupBy } from './chartPanelLayout';
import { metricRunSort, runSortOrderBy, toRunSearchConditions } from './runFilter';

// Runの一覧が表示するものと、APIが保存するSavedViewStateとの変換。

/** この画面が分かる唯一の状態のバージョン。APIの新しいバージョンは推測せずに拒む。 */
export const SAVED_VIEW_STATE_VERSION = 1;

/** Runの一覧が表示するもの。空文字列とnullは一覧の既定を表す。 */
export interface RunListDisplay {
  experimentId: string;
  /** 検索欄の文字列。Runの名前の部分文字列か、絞り込みの式。 */
  searchText: string;
  status: string;
  /** 空ならすべての種類を表示する。 */
  kinds: RunKind[];
  sort: string;
  /** 固定の選択と名前の列の後ろに表示する列。順番どおり。 */
  columns: SavedViewColumn[];
  /** nullなら、Runのメトリクスから作る既定の配置を表示する。 */
  chartPanels: ChartPanelLayout | null;
}

export type SavedViewStateParseResult =
  | { ok: true; state: SavedViewState }
  | { ok: false; reason: 'unsupported_version' | 'invalid' };

// 名前の検索は状態に専用の項目が無いので、APIがその検索のために実行する絞り込みとして保存する。
// そこでは名前の`%`と`_`はワイルドカードになるが、名前にそれらが含まれることはまれ。
const NAME_FILTER_PATTERN = /^attributes\.run_name ILIKE '%((?:[^']|'')*)%'$/;
const quoteFilterString = (value: string) => value.replaceAll("'", "''");

function searchTextToFilter(searchText: string): string {
  const conditions = toRunSearchConditions(searchText);
  if ('filter' in conditions) return conditions.filter;
  if ('name' in conditions) return `attributes.run_name ILIKE '%${quoteFilterString(conditions.name)}%'`;
  return '';
}

function filterToSearchText(filter: string): string {
  const name = NAME_FILTER_PATTERN.exec(filter)?.[1];
  return name === undefined ? filter : name.replaceAll("''", "'");
}

const SORT_ORDER_PATTERN =
  /^metrics\.(?:`((?:[^`]|``)*)`|([\p{L}_][\p{L}\p{N}_]*))\s+(ASC|DESC)$/iu;

/** 保存したorderByに対応する一覧の並び順。一覧に合う選択肢が無ければnull。 */
export function runSortFromOrderBy(orderBy: string[]): string | null {
  if (orderBy.length === 0) return 'newest';
  if (orderBy.length > 1) return null;
  const [order] = orderBy as [string];
  for (const sort of ['oldest', 'name']) if (runSortOrderBy(sort)[0] === order) return sort;
  const metric = SORT_ORDER_PATTERN.exec(order.trim());
  if (!metric) return null;
  const key = metric[1] !== undefined ? metric[1].replaceAll('``', '`') : metric[2]!;
  return metricRunSort(key, metric[3]!.toLowerCase() as 'asc' | 'desc');
}

/** すべてのパネルで共通のグループ分け。Runの一覧の図の帯で、まとめて設定する。 */
const layoutGroupBy = (layout: ChartPanelLayout): RunGroupBy | undefined => layout.panels[0]?.groupBy;

export function toSavedViewState(display: RunListDisplay): SavedViewState {
  const chartPanels = display.chartPanels ?? emptyChartPanelLayout();
  const groupBy = layoutGroupBy(chartPanels);
  return {
    version: SAVED_VIEW_STATE_VERSION,
    experimentIds: display.experimentId ? [display.experimentId] : [],
    filter: searchTextToFilter(display.searchText),
    orderBy: runSortOrderBy(display.sort),
    statuses: display.status ? [display.status as RunStatus] : [],
    kinds: [...display.kinds],
    columns: display.columns.map(({ key, width }) => (width === undefined ? { key } : { key, width })),
    ...(groupBy ? { groupBy } : {}),
    chartPanels,
  };
}

/**
 * 保存した状態に対応する表示。一覧はExperimentとstatusを1つずつ選ぶので、APIを通じてそれより
 * 多く保存したビューは最初のものだけを残す。知らない並び順の代わりには新しい順を使う。
 */
export function toRunListDisplay(state: SavedViewState): RunListDisplay {
  const layout = state.groupBy ? setPanelsGroupBy(state.chartPanels, state.groupBy) : state.chartPanels;
  return {
    experimentId: state.experimentIds[0] ?? '',
    searchText: filterToSearchText(state.filter),
    status: state.statuses[0] ?? '',
    kinds: [...state.kinds],
    sort: runSortFromOrderBy(state.orderBy) ?? 'newest',
    columns: state.columns.map(({ key, width }) => (width === undefined ? { key } : { key, width })),
    // 空の配置にすることで、ビューは決まった図の組ではなく「既定の図」を保つ。
    chartPanels: layout.panels.length ? layout : null,
  };
}

/** APIから来た状態は、この画面が保存されたとおりに表示できるときだけ受け入れる。 */
export function parseSavedViewState(value: unknown): SavedViewStateParseResult {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'invalid' };
  const state = value as Partial<SavedViewState>;
  if (state.version !== SAVED_VIEW_STATE_VERSION) return { ok: false, reason: 'unsupported_version' };
  const chartPanels = parseChartPanelLayout(state.chartPanels);
  const isStringArray = (items: unknown) =>
    Array.isArray(items) && items.every((item) => typeof item === 'string');
  if (
    !chartPanels ||
    !isStringArray(state.experimentIds) ||
    typeof state.filter !== 'string' ||
    !isStringArray(state.orderBy) ||
    !isStringArray(state.statuses) ||
    !isStringArray(state.kinds) ||
    !Array.isArray(state.columns) ||
    !state.columns.every((column) => typeof column?.key === 'string')
  )
    return { ok: false, reason: 'invalid' };
  return { ok: true, state: { ...(state as SavedViewState), chartPanels } };
}

// パネルの順と、省いた任意の項目は表示を変えないので、変更とはみなさない。
function comparableState(state: SavedViewState): string {
  const layout = parseChartPanelLayout(state.chartPanels) ?? state.chartPanels;
  const panels = [...layout.panels].sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({
    experimentIds: state.experimentIds,
    filter: state.filter.trim(),
    orderBy: state.orderBy,
    statuses: state.statuses,
    kinds: state.kinds,
    columns: state.columns.map(({ key, width }) => [key, width ?? null]),
    groupBy: state.groupBy ? [state.groupBy.kind, state.groupBy.key ?? null] : null,
    panels,
  });
}

/**
 * 一覧が今、保存ビューと違うものを表示しているか（「未保存の変更」）。保存した側は一覧での見え方
 * に直して比べるので、一覧に表示できない条件は変更とみなさない。
 */
export function hasUnsavedChanges(saved: SavedViewState, current: SavedViewState): boolean {
  return comparableState(toSavedViewState(toRunListDisplay(saved))) !== comparableState(current);
}
