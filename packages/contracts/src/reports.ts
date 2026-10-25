// 共有するレポート: グラフ、分析、Runの表、メディアを埋め込んだMarkdownで、変更できないバージョン
// として残す。`snapshot`モードのブロックはバージョンの保存時に固定したデータから描き、`live`の
// ブロックはWebの画面が閲覧者自身の権限で描く。
import type { ChartPanelConfig } from './chartPanels.js';
import type { Run } from './index.js';
import type { MetricGroup, MetricSeries } from './metricSeries.js';
import type { ParameterImportanceResult, RunAnalysisTableResponse, RunSet } from './runAnalysis.js';
import type { MediaCompareGrid, MediaTablePage } from './runMedia.js';

// 上限はdocs/api-contract.mdで公開している。
export const REPORT_TITLE_MAX_LENGTH = 300;
export const REPORT_MAX_BLOCKS = 200;
/** `JSON.stringify(blocks)`のUTF-8でのサイズ。 */
export const REPORT_BLOCKS_MAX_BYTES = 1024 * 1024;
export const REPORT_MARKDOWN_MAX_LENGTH = 100_000;
export const REPORT_MESSAGE_MAX_LENGTH = 1000;
export const REPORT_RUN_SET_MAX_RUN_IDS = 200;
export const REPORT_RUN_TABLE_MAX_ROWS = 500;
export const REPORT_RUN_TABLE_MAX_COLUMNS = 200;
/** 1ブロックの固定データ。バージョン全体はMMT_REPORT_SNAPSHOT_MAX_BYTESで制限する。 */
export const REPORT_SNAPSHOT_BLOCK_MAX_BYTES = 5 * 1024 * 1024;

/** 分析APIのRunSet、またはProject全体の保存ビューの検索条件。 */
export type ReportRunSet = RunSet | { savedViewId: string };
export type ReportEmbedMode = 'live' | 'snapshot';

export interface ReportMarkdownBlock {
  type: 'markdown';
  /** クライアントが決める。レポート内で一意で、バージョンをまたいで保つ。 */
  id: string;
  text: string;
}

export interface ReportChartBlock {
  type: 'chart';
  id: string;
  /** groupByがあればRunのグループを示し（POST /metrics/groups）、無ければRunごとに1本の線。 */
  panel: ChartPanelConfig;
  runSet: ReportRunSet;
  mode: ReportEmbedMode;
}

export interface ReportParallelCoordinatesBlock {
  type: 'parallel_coordinates';
  id: string;
  runSet: ReportRunSet;
  /** 省略時: 分析の表と同じ方法で選ぶ。 */
  params?: string[];
  metric: string;
  mode: ReportEmbedMode;
}

export interface ReportParameterImportanceBlock {
  type: 'parameter_importance';
  id: string;
  runSet: ReportRunSet;
  /** runSetがSweepでなければ必須（Sweepならその目的の値）。 */
  targetMetric?: string;
  mode: ReportEmbedMode;
}

/** 軸のフィールド: `params.<key>`、`metrics.<key>`、`objective`（SweepのRunの集合だけ）。 */
export interface ReportScatterBlock {
  type: 'scatter';
  id: string;
  runSet: ReportRunSet;
  x: string;
  y: string;
  color?: string;
  mode: ReportEmbedMode;
}

/** 列はRunの一覧の列キー（`metrics.loss`、`params.lr`、`tags.team`など）。 */
export interface ReportRunTableBlock {
  type: 'run_table';
  id: string;
  runSet: ReportRunSet;
  columns: string[];
  /** 表示する行数。1からREPORT_RUN_TABLE_MAX_ROWSまでで、Runの集合の順に並ぶ。 */
  limit: number;
  mode: ReportEmbedMode;
}

export interface ReportMediaBlock {
  type: 'media';
  id: string;
  runIds: string[];
  key: string;
  /** 省略時: POST /media/compareと同じく、各Runの最新のstep。 */
  steps?: number[];
  mode: ReportEmbedMode;
}

export interface ReportMediaTableBlock {
  type: 'media_table';
  id: string;
  runId: string;
  mediaId: string;
  mode: ReportEmbedMode;
}

export type ReportEmbedBlock =
  | ReportChartBlock
  | ReportParallelCoordinatesBlock
  | ReportParameterImportanceBlock
  | ReportScatterBlock
  | ReportRunTableBlock
  | ReportMediaBlock
  | ReportMediaTableBlock;
export type ReportBlock = ReportMarkdownBlock | ReportEmbedBlock;
export type ReportBlockType = ReportBlock['type'];

export interface ReportUser {
  id: string;
  displayName: string;
}

export interface Report {
  id: string;
  projectId: string;
  /** 今のバージョンのタイトル。 */
  title: string;
  currentRevision: number;
  createdBy: ReportUser;
  createdAt: string;
  /** 今のバージョンを保存したeditor。 */
  updatedBy: ReportUser;
  /** 最後にバージョンを保存した時刻、またはレポートをアーカイブ・アーカイブ解除した時刻。 */
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: ReportUser | null;
}

export interface ReportRevisionSummary {
  reportId: string;
  revision: number;
  title: string;
  message: string | null;
  /** このバージョンを保存したeditor。 */
  createdBy: ReportUser;
  createdAt: string;
  /** POST /restoreで作られたバージョンのときに入る。 */
  restoredFromRevision: number | null;
}

export interface ReportRevision extends ReportRevisionSummary {
  blocks: ReportBlock[];
}

/** GET /reports/:idと、作成・更新・復元の応答。 */
export interface ReportDetail {
  report: Report;
  revision: ReportRevision;
}

export interface ReportPage {
  items: Report[];
  nextCursor: string | null;
}

export interface ReportCreate {
  title: string;
  blocks: ReportBlock[];
  message?: string;
}

export interface ReportUpdate {
  /** 編集を始めたバージョン。途中で別の保存があれば409の競合になる。 */
  baseRevision: number;
  title: string;
  blocks: ReportBlock[];
  message?: string;
  /** 前のバージョンから変わっていなくても、取り直すスナップショットのブロック。 */
  refreshSnapshotBlockIds?: string[];
}

export interface ReportRestore {
  revision: number;
}

/** 固定したRunの集合のRun。線や行にラベルを付けるのに足りるだけの情報。 */
export interface ReportSnapshotRun {
  runId: string;
  name: string;
}

export type ReportSnapshotData =
  | {
      type: 'chart';
      runs: ReportSnapshotRun[];
      /** panel.groupByが無いとき。 */
      series?: MetricSeries[];
      /** panel.groupByがあるとき。 */
      groups?: MetricGroup[];
    }
  | { type: 'parallel_coordinates'; table: RunAnalysisTableResponse }
  | { type: 'parameter_importance'; importance: ParameterImportanceResult }
  | { type: 'scatter'; table: RunAnalysisTableResponse }
  | { type: 'run_table'; runs: Run[] }
  /** セルはArtifactをIDで指す。Artifactは変わらないので、メディアも同じまま。 */
  | { type: 'media'; runs: ReportSnapshotRun[]; grid: MediaCompareGrid }
  /** 表の最初のページ。 */
  | { type: 'media_table'; page: MediaTablePage };

export interface ReportBlockSnapshot {
  blockId: string;
  /** データを取り込んだ保存のバージョン。引き継いだときは、読んだバージョンより前になる。 */
  capturedRevision: number;
  capturedAt: string;
  sizeBytes: number;
  data: ReportSnapshotData;
}

/** GET /reports/:id/snapshots?revision= */
export interface ReportSnapshotList {
  revision: number;
  items: ReportBlockSnapshot[];
}
