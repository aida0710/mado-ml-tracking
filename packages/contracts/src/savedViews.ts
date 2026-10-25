import type { ChartPanelLayout, RunGroupBy } from './chartPanels.js';
import type { RunKind, RunStatus } from './index.js';

/** `private`は所有者だけに見え、`project`はProjectのすべてのviewerに見える。 */
export type SavedViewVisibility = 'private' | 'project';
/** ビューが復元する一覧のページ。SweepやArtifactはあとで足すかもしれない。 */
export type SavedViewPage = 'runs';

/** 1つのビューが小さい行にとどまるよう、`JSON.stringify(state)`のUTF-8でのサイズに上限を設ける。 */
export const SAVED_VIEW_STATE_MAX_BYTES = 64 * 1024;
export const SAVED_VIEW_NAME_MAX_LENGTH = 200;
export const SAVED_VIEW_MAX_COLUMNS = 200;

export interface SavedViewColumn {
  /** Runの一覧の列の識別子。`metrics.loss`や`params.lr`など。 */
  key: string;
  /** CSSピクセルでの幅。無ければ一覧の既定の幅。 */
  width?: number;
}

/**
 * Runの一覧の表示条件。`filter`と`orderBy`はRunSearchRequestの構文を使い、ビューの保存時に
 * コンパイルする。未知の`version`は拒否する。
 */
export interface SavedViewState {
  version: 1;
  experimentIds: string[];
  filter: string;
  orderBy: string[];
  statuses: RunStatus[];
  kinds: RunKind[];
  columns: SavedViewColumn[];
  groupBy?: RunGroupBy;
  chartPanels: ChartPanelLayout;
}

export interface SavedView {
  id: string;
  projectId: string;
  ownerUserId: string;
  visibility: SavedViewVisibility;
  page: SavedViewPage;
  name: string;
  state: SavedViewState;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewCreate {
  visibility: SavedViewVisibility;
  page: SavedViewPage;
  name: string;
  state: SavedViewState;
}

export interface SavedViewPatch {
  name?: string;
  state?: SavedViewState;
  visibility?: SavedViewVisibility;
}
