import {
  datasetFolderUploadPrefix,
  type DatasetFolderUpload,
  type DatasetFolderUploadDiscard,
} from '@mmt/contracts';
import type { StoredFolderFile } from '../lib/datasetFolderResume';
import { encodeId, projectPath, request, requestItems } from './http';
import { trackingApi } from './tracking';

const folderUploadsPath = (projectId: string, datasetId: string) =>
  `${projectPath(projectId)}/datasets/${encodeId(datasetId)}/folder-uploads`;
// The catalog's largest page, so a corpus of thousands of files takes few requests.
const STORED_FILE_PAGE_SIZE = 500;

/** Folder uploads of a dataset that stopped before their version (GET/DELETE …/folder-uploads). */
export const datasetFolderUploadsApi = {
  list: (projectId: string, datasetId: string, signal?: AbortSignal) =>
    requestItems<DatasetFolderUpload>(folderUploadsPath(projectId, datasetId), signal),
  /** Project admins only; files something uses are kept and counted. */
  discard: (projectId: string, upload: { datasetId: string; folder: string }) =>
    request<DatasetFolderUploadDiscard>(
      `${folderUploadsPath(projectId, upload.datasetId)}/${encodeId(upload.folder)}`,
      { method: 'DELETE' },
    ),
  /** Every file an attempt stored, read page by page from the Project's Artifact catalog. */
  storedFiles: async (
    projectId: string,
    upload: { datasetId: string; folder: string },
    signal?: AbortSignal,
  ): Promise<StoredFolderFile[]> => {
    const prefix = datasetFolderUploadPrefix(upload);
    const files: StoredFolderFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await trackingApi.projectArtifactPage(
        projectId,
        { limit: STORED_FILE_PAGE_SIZE, query: prefix, versions: 'latest', cursor },
        signal,
      );
      // The catalog matches the text anywhere in the path; only the attempt's own files count.
      for (const artifact of page.items)
        if (artifact.runId === null && artifact.path.startsWith(prefix))
          files.push({ id: artifact.id, path: artifact.path, size: artifact.size, sha256: artifact.sha256 });
      cursor = page.nextCursor;
    } while (cursor);
    return files;
  },
};
