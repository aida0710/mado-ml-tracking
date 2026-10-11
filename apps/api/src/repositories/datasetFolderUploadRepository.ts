import {
  DATASET_FOLDER_UPLOAD_FOLDER_PATTERN,
  datasetFolderUploadPrefix,
  datasetFolderUploadRoot,
  type DatasetFolderUpload,
} from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';

/**
 * Folder uploads of the dataset that stopped before their version: folders below the dataset's
 * upload root whose stored Runless Artifacts no DatasetVersion lists. A folder that became a
 * version is left out even when a late file of it is not listed; that file is deleted on its own.
 */
export async function listUnfinishedFolderUploads(
  connection: Connection,
  location: { projectId: string; datasetId: string },
): Promise<DatasetFolderUpload[]> {
  const root = datasetFolderUploadRoot(location.datasetId);
  const found = await rows<Omit<DatasetFolderUpload, 'pathPrefix'>>(
    connection,
    `WITH stored AS (
       SELECT split_part(substr(a.path,length($2::text)+1),'/',1) AS folder,a.size,a.created_at,
         EXISTS(SELECT 1 FROM dataset_version_files file WHERE file.artifact_id=a.id) AS listed
       FROM artifacts a
       WHERE a.project_id=$1 AND a.run_id IS NULL AND a.deleted_at IS NULL
         AND starts_with(a.path,$2::text) AND strpos(substr(a.path,length($2::text)+1),'/')>0
     )
     SELECT folder,count(*)::int AS file_count,sum(size) AS total_size,
       min(created_at) AS first_stored_at,max(created_at) AS last_stored_at
     FROM stored WHERE folder ~ $3
     GROUP BY folder HAVING NOT bool_or(listed)
     ORDER BY max(created_at) DESC`,
    [location.projectId, root, DATASET_FOLDER_UPLOAD_FOLDER_PATTERN],
  );
  return found.map((upload) => ({
    ...upload,
    pathPrefix: datasetFolderUploadPrefix({ datasetId: location.datasetId, folder: upload.folder }),
  }));
}

/** IDs of the live Runless Artifacts stored below a path prefix. */
export async function findRunlessArtifactIdsBelow(
  connection: Connection,
  location: { projectId: string; prefix: string },
): Promise<string[]> {
  const found = await rows<{ id: string }>(
    connection,
    `SELECT id FROM artifacts WHERE project_id=$1 AND run_id IS NULL AND deleted_at IS NULL
     AND starts_with(path,$2::text)`,
    [location.projectId, location.prefix],
  );
  return found.map(({ id }) => id);
}
