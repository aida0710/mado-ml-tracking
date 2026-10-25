/**
 * フォルダのアップロード（画面の"フォルダから作る"）は、各ファイルをRunを持たないArtifactとして
 * `datasets/<datasetId>/<folder>/<path in the dataset>`に保存し、すべて保存し終えたら新しい
 * バージョンに並べる。folderはアップロードを始めた時刻なので、試行ごとのファイルは混ざらない。
 */

/**
 * folderの名前。開始時刻のISO文字列の':'と'.'を'-'に置き換えたもの（2026-10-08T14-19-08-955Z）。
 * PostgreSQLとJavaScriptで同じに解釈されるよう、[0-9]で書く。
 */
export const DATASET_FOLDER_UPLOAD_FOLDER_PATTERN =
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z$';

/**
 * そのデータセットのすべてのフォルダのアップロードに共通する、Artifactのパスの先頭。試行ごとに
 * その下の1つのフォルダになる。
 */
export function datasetFolderUploadRoot(datasetId: string): string {
  return `datasets/${datasetId}/`;
}

/** 1回のフォルダのアップロードのファイルすべてに共通する、Artifactのパスの先頭。 */
export function datasetFolderUploadPrefix(location: { datasetId: string; folder: string }): string {
  return `${datasetFolderUploadRoot(location.datasetId)}${location.folder}/`;
}

/**
 * GET /projects/:p/datasets/:d/folder-uploads: バージョンを作る前に止まったフォルダの
 * アップロード。そのため、保存済みのファイルはどのデータセットのバージョンにも並んでいない。
 * prefixの下でまだ開いているアップロードセッションはここでは数えない。各自が
 * GET /artifact-uploadsで自分のものを一覧する。
 */
export interface DatasetFolderUpload {
  folder: string;
  pathPrefix: string;
  fileCount: number;
  totalSize: number;
  firstStoredAt: string;
  lastStoredAt: string;
}

/**
 * DELETE /projects/:p/datasets/:d/folder-uploads/:folder。その間にほかのもの（バージョン、
 * モデルバージョンなど）が使い始めたファイルは残し、別に数える。
 */
export interface DatasetFolderUploadDiscard {
  deletedFileCount: number;
  keptFileCount: number;
}
