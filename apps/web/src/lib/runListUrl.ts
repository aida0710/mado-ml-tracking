import type { RunKind } from '@mmt/contracts';
import type { RunListDisplay } from './savedViewState';

// Runの一覧のURLパラメータ。再読み込みやリンクで保てるよう、条件はURLに置く。保存ビューはidだけ
// を足し、状態は入れない。状態はリンクには長すぎる。

export const RUN_LIST_PARAMS = {
  experiment: 'experiment',
  searchText: 'q',
  status: 'status',
  /** Runの種類をカンマ区切りで。保存ビューは2つ以上を持つことがある。 */
  kinds: 'kinds',
  sort: 'sort',
  /** 再読み込みや共有したリンクでも、図の領域を開いたままにする。 */
  charts: 'charts',
  view: 'view',
} as const;
export const CHARTS_OPEN = '1';
export const DEFAULT_RUN_SORT = 'newest';
const KIND_SEPARATOR = ',';
/** すべてのRunの種類。一覧が選択肢に出す順。 */
export const RUN_KINDS: readonly RunKind[] = ['training', 'finetuning', 'inference', 'evaluation', 'processing'];
const isRunKind = (value: string): value is RunKind => (RUN_KINDS as readonly string[]).includes(value);

export type RunListConditions = Pick<
  RunListDisplay,
  'experimentId' | 'searchText' | 'status' | 'kinds' | 'sort'
>;

/** URLの値が指す種類。知らない名前（書き換えたリンク）は捨て、APIへ送らない。 */
export function parseRunKinds(value: string | null): RunKind[] {
  return [...new Set((value ?? '').split(KIND_SEPARATOR).filter(isRunKind))];
}
export const formatRunKinds = (kinds: readonly RunKind[]) => kinds.join(KIND_SEPARATOR);

export function readRunListConditions(params: URLSearchParams): RunListConditions {
  return {
    experimentId: params.get(RUN_LIST_PARAMS.experiment) ?? '',
    searchText: params.get(RUN_LIST_PARAMS.searchText) ?? '',
    status: params.get(RUN_LIST_PARAMS.status) ?? '',
    kinds: parseRunKinds(params.get(RUN_LIST_PARAMS.kinds)),
    sort: params.get(RUN_LIST_PARAMS.sort) ?? DEFAULT_RUN_SORT,
  };
}

/** 開いたビューのURL。そのidと表示する条件を含み、図があれば図を開いた状態にする。 */
export function runListParamsForView(viewId: string, display: RunListDisplay): URLSearchParams {
  const params = new URLSearchParams({ [RUN_LIST_PARAMS.view]: viewId });
  if (display.experimentId) params.set(RUN_LIST_PARAMS.experiment, display.experimentId);
  if (display.searchText) params.set(RUN_LIST_PARAMS.searchText, display.searchText);
  if (display.status) params.set(RUN_LIST_PARAMS.status, display.status);
  if (display.kinds.length) params.set(RUN_LIST_PARAMS.kinds, formatRunKinds(display.kinds));
  if (display.sort !== DEFAULT_RUN_SORT) params.set(RUN_LIST_PARAMS.sort, display.sort);
  if (display.chartPanels) params.set(RUN_LIST_PARAMS.charts, CHARTS_OPEN);
  return params;
}

/** ビューの共有用のリンク。`?view=<id>`だけを持つ。 */
export function savedViewUrl(origin: string, projectId: string, viewId: string): string {
  const query = new URLSearchParams({ [RUN_LIST_PARAMS.view]: viewId });
  return new URL(`/projects/${encodeURIComponent(projectId)}/experiments?${query}`, origin).href;
}
