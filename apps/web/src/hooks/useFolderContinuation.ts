import { useEffect, useState } from 'react';
import { planDatasetFolder } from '../lib/datasetFolder';
import {
  chooseFolderToContinue,
  countContinuedFiles,
  type StoredFolderFile,
  type UnfinishedFolderUpload,
} from '../lib/datasetFolderResume';
import type { UploadSource } from '../lib/droppedFiles';
import { formatErrorMessage } from '../lib/errorMessage';

/** The stopped attempt a chosen folder continues, with what it already holds of the folder. */
export interface FolderContinuation {
  upload: UnfinishedFolderUpload;
  storedFiles: StoredFolderFile[];
  /** Chosen files the attempt holds at the same path and size; their bytes are compared on start. */
  matchedCount: number;
}

type ContinuationCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ready'; continuation: FolderContinuation | null }
  | { status: 'failed'; error: string };

/**
 * Decides whether the chosen folder continues a stopped attempt. Choosing a folder compares it
 * with every attempt and takes the one holding most of its files; the row's [続きを送る] names the
 * attempt itself. Either can be declined, and the folder then goes up as a new upload.
 */
export function useFolderContinuation({
  datasetId,
  sources,
  uploads,
  loadStoredFiles,
}: {
  datasetId: string;
  sources: UploadSource[];
  uploads: UnfinishedFolderUpload[];
  loadStoredFiles: (folder: string) => Promise<StoredFolderFile[]>;
}) {
  // Both belong to one selection of files, so choosing another folder forgets them.
  const [chosenFolder, setChosenFolder] = useState<{ sources: UploadSource[]; folder: string } | null>(null);
  const [declinedSources, setDeclinedSources] = useState<UploadSource[] | null>(null);
  const [check, setCheck] = useState<ContinuationCheck>({ status: 'idle' });
  const folder = chosenFolder?.sources === sources ? chosenFolder.folder : null;
  const isDeclined = declinedSources === sources;
  const uploadsKey = uploads.map((upload) => `${upload.folder}:${upload.storedFileCount}:${upload.openUploads.length}`).join(',');

  useEffect(() => {
    if (sources.length === 0) {
      setCheck({ status: 'idle' });
      return;
    }
    const candidates = folder ? uploads.filter((upload) => upload.folder === folder) : uploads;
    if (isDeclined || candidates.length === 0) {
      setCheck({ status: 'ready', continuation: null });
      return;
    }
    let isCurrent = true;
    setCheck({ status: 'checking' });
    void Promise.all(
      candidates.map(async (upload) => {
        const storedFiles = upload.storedFileCount > 0 ? await loadStoredFiles(upload.folder) : [];
        const entries = planDatasetFolder(sources, { datasetId, folder: upload.folder });
        const matchedCount = countContinuedFiles({ entries, storedFiles, openUploads: upload.openUploads });
        return { upload, storedFiles, matchedCount };
      }),
    ).then(
      (measured) => {
        if (!isCurrent) return;
        // A named attempt is continued even when nothing matches yet; the notice then says so.
        const best = folder
          ? measured[0]!
          : measured.find(
              (candidate) =>
                candidate.upload.folder ===
                chooseFolderToContinue(
                  measured.map(({ upload, matchedCount }) => ({ folder: upload.folder, matchedCount })),
                )?.folder,
            );
        setCheck({ status: 'ready', continuation: best ?? null });
      },
      (failure: unknown) => {
        if (isCurrent) setCheck({ status: 'failed', error: formatErrorMessage(failure) });
      },
    );
    return () => {
      isCurrent = false;
    };
    // uploads is compared by uploadsKey; a reload with the same attempts changes nothing.
  }, [datasetId, folder, isDeclined, loadStoredFiles, sources, uploadsKey]);

  return {
    continuation: check.status === 'ready' ? check.continuation : null,
    isChecking: check.status === 'checking',
    error: check.status === 'failed' ? check.error : null,
    /** Continues this attempt with the folder chosen from its row. */
    continueUpload: (upload: UnfinishedFolderUpload, chosen: UploadSource[]) => {
      setDeclinedSources(null);
      setChosenFolder({ sources: chosen, folder: upload.folder });
    },
    /** Sends the chosen folder as a new upload, next to the stopped attempt. */
    startNew: () => {
      setChosenFolder(null);
      setDeclinedSources(sources);
    },
  };
}
