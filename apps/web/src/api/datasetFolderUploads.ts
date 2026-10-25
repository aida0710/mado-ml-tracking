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
// Artifactカタログの最大のページ。数千ファイルのコーパスでも少ない要求で読み終わる。
const STORED_FILE_PAGE_SIZE = 500;

/** バージョンを作る前に止まった、データセットのフォルダのアップロード（GET/DELETE …/folder-uploads）。 */
export const datasetFolderUploadsApi = {
  list: (projectId: string, datasetId: string, signal?: AbortSignal) =>
    requestItems<DatasetFolderUpload>(folderUploadsPath(projectId, datasetId), signal),
  /** Project adminだけ。何かが使っているファイルは残し、その数を数える。 */
  discard: (projectId: string, upload: { datasetId: string; folder: string }) =>
    request<DatasetFolderUploadDiscard>(
      `${folderUploadsPath(projectId, upload.datasetId)}/${encodeId(upload.folder)}`,
      { method: 'DELETE' },
    ),
  /** そのアップロードで保存したすべてのファイル。ProjectのArtifactカタログから1ページずつ読む。 */
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
      // カタログはパスの途中の一致も返すので、そのアップロード自身のファイルだけを拾う。
      for (const artifact of page.items)
        if (artifact.runId === null && artifact.path.startsWith(prefix))
          files.push({ id: artifact.id, path: artifact.path, size: artifact.size, sha256: artifact.sha256 });
      cursor = page.nextCursor;
    } while (cursor);
    return files;
  },
};
