import { useEffect, useEffectEvent, useState } from 'react';
import { planDatasetFolder } from '../lib/datasetFolder';
import {
  chooseFolderToContinue,
  countContinuedFiles,
  type StoredFolderFile,
  type UnfinishedFolderUpload,
} from '../lib/datasetFolderResume';
import type { UploadSource } from '../lib/droppedFiles';
import { formatErrorMessage } from '../lib/errorMessage';
import { useLocale } from '../i18n/useLocale';

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
  | { status: 'failed'; failure: unknown };

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
  useLocale();
  // Both belong to one selection of files, so choosing another folder forgets them.
  const [chosenFolder, setChosenFolder] = useState<{ sources: UploadSource[]; folder: string } | null>(null);
  const [declinedSources, setDeclinedSources] = useState<UploadSource[] | null>(null);
  const folder = chosenFolder?.sources === sources ? chosenFolder.folder : null;
  const isDeclined = declinedSources === sources;
  const uploadsKey = uploads.map((upload) => `${upload.folder}:${upload.storedFileCount}:${upload.openUploads.length}`).join(',');
  const candidates = folder ? uploads.filter((upload) => upload.folder === folder) : uploads;
  // Known without reading anything: no files chosen, the attempt declined, or none to continue.
  const decidedCheck: ContinuationCheck | null =
    sources.length === 0
      ? { status: 'idle' }
      : isDeclined || candidates.length === 0
        ? { status: 'ready', continuation: null }
        : null;
  // The answer of the last comparison, with the selection it was made for.
  const [measured, setMeasured] = useState<{
    sources: UploadSource[];
    folder: string | null;
    uploadsKey: string;
    check: ContinuationCheck;
  } | null>(null);
  const isMeasuredCurrent =
    measured !== null &&
    measured.sources === sources &&
    measured.folder === folder &&
    measured.uploadsKey === uploadsKey;
  const check: ContinuationCheck =
    decidedCheck ?? (isMeasuredCurrent ? measured.check : { status: 'checking' });

  // Reads the attempts of the latest render: uploads is compared by uploadsKey, so a reload with
  // the same attempts changes nothing.
  const measureCandidates = useEffectEvent(() =>
    Promise.all(
      candidates.map(async (upload) => {
        const storedFiles = upload.storedFileCount > 0 ? await loadStoredFiles(upload.folder) : [];
        const entries = planDatasetFolder(sources, { datasetId, folder: upload.folder });
        const matchedCount = countContinuedFiles({ entries, storedFiles, openUploads: upload.openUploads });
        return { upload, storedFiles, matchedCount };
      }),
    ),
  );
  const needsMeasuring = decidedCheck === null;
  useEffect(() => {
    if (!needsMeasuring) return;
    let isCurrent = true;
    const selection = { sources, folder, uploadsKey };
    void measureCandidates().then(
      (measuredCandidates) => {
        if (!isCurrent) return;
        // A named attempt is continued even when nothing matches yet; the notice then says so.
        const best = folder
          ? measuredCandidates[0]!
          : measuredCandidates.find(
              (candidate) =>
                candidate.upload.folder ===
                chooseFolderToContinue(
                  measuredCandidates.map(({ upload, matchedCount }) => ({ folder: upload.folder, matchedCount })),
                )?.folder,
            );
        setMeasured({ ...selection, check: { status: 'ready', continuation: best ?? null } });
      },
      (failure: unknown) => {
        if (isCurrent) setMeasured({ ...selection, check: { status: 'failed', failure } });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [datasetId, folder, loadStoredFiles, needsMeasuring, sources, uploadsKey]);

  return {
    continuation: check.status === 'ready' ? check.continuation : null,
    isChecking: check.status === 'checking',
    // Put into words here, so a later change of display language reaches the message.
    error: check.status === 'failed' ? formatErrorMessage(check.failure) : null,
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
