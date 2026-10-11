/**
 * A folder upload ("フォルダから作る" in the Web) stores each file as a Runless Artifact at
 * `datasets/<datasetId>/<folder>/<path in the dataset>` and lists them in a new version once all
 * are stored. The folder is the time the upload started, so the files of each attempt stay apart.
 */

/**
 * The folder name: the start time as an ISO string with ':' and '.' replaced by '-'
 * (2026-10-08T14-19-08-955Z). Written with [0-9] so PostgreSQL and JavaScript read it alike.
 */
export const DATASET_FOLDER_UPLOAD_FOLDER_PATTERN =
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z$';

/** The Artifact path every folder upload of the dataset starts with; each attempt is a folder below. */
export function datasetFolderUploadRoot(datasetId: string): string {
  return `datasets/${datasetId}/`;
}

/** The Artifact path every file of one folder upload starts with. */
export function datasetFolderUploadPrefix(location: { datasetId: string; folder: string }): string {
  return `${datasetFolderUploadRoot(location.datasetId)}${location.folder}/`;
}

/**
 * GET /projects/:p/datasets/:d/folder-uploads: a folder upload that stopped before its version,
 * so no version of any dataset lists its stored files. Upload sessions still open under the
 * prefix are not counted here; each person lists their own with GET /artifact-uploads.
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
 * DELETE /projects/:p/datasets/:d/folder-uploads/:folder. Files something started to use in the
 * meantime (a version, a model version, ...) are kept and counted apart.
 */
export interface DatasetFolderUploadDiscard {
  deletedFileCount: number;
  keptFileCount: number;
}
