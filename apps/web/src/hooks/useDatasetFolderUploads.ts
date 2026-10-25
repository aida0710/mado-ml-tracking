import { useCallback, useRef, useState } from 'react';
import type { ArtifactUploadListItem } from '@mmt/contracts';
import { datasetFolderUploadsApi } from '../api/datasetFolderUploads';
import {
  mergeUnfinishedFolderUploads,
  type StoredFolderFile,
  type UnfinishedFolderUpload,
} from '../lib/datasetFolderResume';
import { useQuery } from './useQuery';

/** ほかで使われているファイルを残した破棄。そのフォルダは一覧に残る。 */
export interface FolderUploadDiscardWithKeptFiles {
  upload: UnfinishedFolderUpload;
  keptFileCount: number;
}

/**
 * バージョンを作る前に止まったデータセットのフォルダのアップロードと、その続きを送る（保存済みの
 * ファイル）か破棄するのに要るもの。保存済みのファイルを消せるのは、Artifactを削除できる
 * Project adminのときだけ。開いているアップロードは誰でも自分の分を破棄できる。モデルバージョン・
 * コードバージョン・checkpointが使うファイルはサーバーが残し、ファイルを残した最後の破棄を知らせる。
 */
export function useDatasetFolderUploads({
  projectId,
  datasetId,
  openUploads,
  discardOpenUpload,
  canDeleteStoredFiles,
}: {
  projectId: string;
  datasetId: string;
  /** この利用者のRunの無い開いているアップロード。アップロードのキューが一覧に出すもの。 */
  openUploads: ArtifactUploadListItem[];
  discardOpenUpload: (uploadId: string) => Promise<void>;
  canDeleteStoredFiles: boolean;
}) {
  const stored = useQuery({ key: `${projectId}:dataset-folder-uploads:${datasetId}`, load: (signal) =>
    datasetFolderUploadsApi.list(projectId, datasetId, signal),
  });
  // フォルダを選ぶと、止まったアップロードのすべてと比べる。それぞれのファイルの一覧は1回だけ読む。
  const storedFilesRef = useRef(new Map<string, Promise<StoredFolderFile[]>>());
  const [discardWithKeptFiles, setDiscardWithKeptFiles] = useState<FolderUploadDiscardWithKeptFiles | null>(null);
  const reloadStored = stored.reload;
  const uploads = mergeUnfinishedFolderUploads({
    datasetId,
    stored: stored.value ?? [],
    openUploads,
  });

  const loadStoredFiles = useCallback(
    (folder: string): Promise<StoredFolderFile[]> => {
      let files = storedFilesRef.current.get(folder);
      if (!files) {
        files = datasetFolderUploadsApi.storedFiles(projectId, { datasetId, folder });
        // 読み込みに失敗したら覚えておかず、次のときにもう一度読む。
        files.catch(() => storedFilesRef.current.delete(folder));
        storedFilesRef.current.set(folder, files);
      }
      return files;
    },
    [datasetId, projectId],
  );

  const discard = useCallback(
    async (upload: UnfinishedFolderUpload) => {
      const deletesStoredFiles = upload.storedFileCount > 0 && canDeleteStoredFiles;
      const keptFileCount = deletesStoredFiles
        ? (await datasetFolderUploadsApi.discard(projectId, { datasetId, folder: upload.folder })).keptFileCount
        : 0;
      for (const session of upload.openUploads) await discardOpenUpload(session.id);
      storedFilesRef.current.delete(upload.folder);
      setDiscardWithKeptFiles(keptFileCount > 0 ? { upload, keptFileCount } : null);
      reloadStored();
    },
    [canDeleteStoredFiles, datasetId, discardOpenUpload, projectId, reloadStored],
  );

  return {
    uploads,
    error: stored.error,
    reload: stored.reload,
    loadStoredFiles,
    discard,
    discardWithKeptFiles,
  };
}
