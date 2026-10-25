import type { ArtifactMediaInfo } from './artifactMediaInfo.js';
import type { JsonObject, JsonValue } from './index.js';

export type RunMediaKind = 'audio' | 'image' | 'video' | 'table';

/**
 * native: POST /runs/:r/mediaで登録したもの。mlflow: MLflow自身の配置から索引したもの。images/の
 * 下のlog_image(key=, step=)のファイルか、mlflow.loggedArtifacts tagに挙がった表。
 */
export type RunMediaSource = 'native' | 'mlflow';

/** Runのあるkeyとstepのメディアファイル1つ。 */
export interface RunMedia {
  id: string;
  runId: string;
  key: string;
  step: number;
  kind: RunMediaKind;
  artifactId: string;
  /** MLflowが作る同じ画像の圧縮した.webp。無ければnull。 */
  thumbnailArtifactId: string | null;
  caption: string | null;
  metadata: JsonObject;
  source: RunMediaSource;
  /** Artifactのパス、MIMEタイプ、サイズ。 */
  path: string;
  mimeType: string;
  size: number;
  /** artifactIdのGET /api/projects/:p/artifacts/:a/content。 */
  contentUrl: string;
  thumbnailContentUrl: string | null;
  /** Artifactにメディア情報（音声）があるときにある。 */
  mediaInfo?: ArtifactMediaInfo;
  createdAt: string;
}

export interface RunMediaCreateItem {
  /** クライアントが決めるid。同じidと内容で送り直すと、保存済みの項目を返す。 */
  id?: string;
  key: string;
  step: number;
  kind: RunMediaKind;
  artifactId: string;
  caption?: string | null;
  metadata?: JsonObject;
}

/** POST /projects/:p/runs/:r/media */
export interface RunMediaCreate {
  items: RunMediaCreateItem[];
}

export interface RunMediaList {
  items: RunMedia[];
}

export interface RunMediaPage {
  items: RunMedia[];
  nextCursor?: string;
}

export interface RunMediaKeySummary {
  key: string;
  kind: RunMediaKind;
  count: number;
  minStep: number;
  maxStep: number;
}

/** POST /projects/:p/media/compare */
export interface MediaCompareRequest {
  runIds: string[];
  key: string;
  kind?: RunMediaKind;
  /** 比べるstep。省略すると、各Runのそのkeyの最新のstep。 */
  steps?: number[];
}

export interface MediaCompareRow {
  runId: string;
  /**
   * MediaCompareGrid.stepsに対応する。stepsがnullなら1つのセル（Runの最新のstep）。セルはその
   * stepのメディア（通常は1つ）を並べ、無ければnull。近いstepで代用することはない。
   */
  cells: Array<RunMedia[] | null>;
}

export interface MediaCompareGrid {
  key: string;
  /** リクエストされたstep（リクエストの順）。リクエストで省略したときはnull。 */
  steps: number[] | null;
  rows: MediaCompareRow[];
}

export type MediaTableColumnType = 'text' | 'number' | 'audio' | 'image' | 'video' | 'json';

export interface MediaTableColumn {
  name: string;
  type: MediaTableColumnType;
}

/** メディアのセルがArtifactに解決できなかった理由。 */
export type MediaTableReferenceError =
  | 'empty'
  | 'absolute_path'
  | 'parent_path'
  | 'unsupported_scheme'
  | 'invalid_run_reference'
  | 'other_project'
  | 'not_found';

/** audio・image・videoの列のセル。ファイルをArtifactに解決したあとのもの。 */
export interface MediaTableMediaCell {
  type: 'audio' | 'image' | 'video';
  /** セルが指すRunとパス。参照の形式が正しくなければnull。 */
  runId: string | null;
  path: string | null;
  artifactId: string | null;
  /** MLflowのcompressed_filepath。同じ方法で解決する。 */
  thumbnailArtifactId: string | null;
  error: MediaTableReferenceError | null;
}

/**
 * セルは列の型に従う。textは文字列、numberは数値、audio・image・videoはMediaTableMediaCell、
 * jsonは任意のJSONの値。値が無いときは、どの列の型でもnull。
 */
export type MediaTableCell = MediaTableMediaCell | JsonValue;

/** GET /projects/:p/runs/:r/media/:mediaId/table */
export interface MediaTablePage {
  columns: MediaTableColumn[];
  rows: MediaTableCell[][];
  totalRows: number;
  offset: number;
}

export const RUN_MEDIA_CREATE_MAX_ITEMS = 1000;
export const RUN_MEDIA_KEY_MAX_LENGTH = 250;
export const RUN_MEDIA_CAPTION_MAX_LENGTH = 1000;
export const RUN_MEDIA_METADATA_MAX_BYTES = 16 * 1024;
export const MEDIA_COMPARE_MAX_RUNS = 20;
export const MEDIA_COMPARE_MAX_STEPS = 50;
export const MEDIA_TABLE_PAGE_MAX_ROWS = 200;
/** これより大きい表のファイルは、APIでページ分けせずにダウンロードさせる。 */
export const MEDIA_TABLE_MAX_BYTES = 50 * 1024 * 1024;
/** log_tableのファイルを挙げるMLflowのtag（[{path, type:'table'}]）。 */
export const MLFLOW_LOGGED_ARTIFACTS_TAG = 'mlflow.loggedArtifacts';
