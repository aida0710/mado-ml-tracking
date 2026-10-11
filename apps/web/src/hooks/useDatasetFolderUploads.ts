import { useCallback, useRef, useState } from 'react';
import type { ArtifactUploadListItem } from '@mmt/contracts';
import { datasetFolderUploadsApi } from '../api/datasetFolderUploads';
import {
  mergeUnfinishedFolderUploads,
  type StoredFolderFile,
  type UnfinishedFolderUpload,
} from '../lib/datasetFolderResume';
import { useQuery } from './useQuery';

/** A discard that left files because something else uses them, so its folder stays listed. */
export interface FolderUploadDiscardWithKeptFiles {
  upload: UnfinishedFolderUpload;
  keptFileCount: number;
}

/**
 * Folder uploads of the dataset that stopped before their version, with what is needed to
 * continue one (its stored files) or discard it. Stored files go only with a Project admin, who
 * may delete Artifacts; anyone discards their own open uploads. Files a model version, code
 * version or checkpoint uses are kept by the server; the last discard that kept some is reported.
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
  /** This person's open uploads without a Run, as the upload queue lists them. */
  openUploads: ArtifactUploadListItem[];
  discardOpenUpload: (uploadId: string) => Promise<void>;
  canDeleteStoredFiles: boolean;
}) {
  const stored = useQuery(`${projectId}:dataset-folder-uploads:${datasetId}`, (signal) =>
    datasetFolderUploadsApi.list(projectId, datasetId, signal),
  );
  // Choosing a folder compares it with every attempt; each attempt's file list is read once.
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
        // A failed read is tried again the next time instead of being remembered.
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
