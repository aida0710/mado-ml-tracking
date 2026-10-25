// Resume decisions of the upload dialog: finds the unfinished upload of a newly chosen file so its
// path is filled in, and continues or restarts the unfinished upload a person picked a file for.
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ArtifactUploadListItem } from '@mmt/contracts';
import { artifactUploadsApi } from '../api/artifactUploads';
import type { UploadSource } from '../lib/droppedFiles';
import type { ResumeBlocker } from '../lib/uploadResumeBlocker';
import {
  createPartDigestReader,
  inspectSessionForFile,
  orderResumeCandidates,
  type PartDigestReader,
} from '../lib/uploadResumeMatch';
import { findUploadIdsRecordedForFile } from '../lib/uploadResumeStore';
import type { UploadEntry } from './useArtifactUploadQueue';

/** The unfinished upload of the chosen file, with what the server holds of it now. */
export interface ResumeMatch {
  uploadId: string;
  path: string;
  receivedBytes: number;
  expectedSize: number;
}

export type SelectedFileResume =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'matched'; match: ResumeMatch };

const IDLE_RESUME: SelectedFileResume = { status: 'idle' };
const CHECKING_RESUME: SelectedFileResume = { status: 'checking' };

export function useUploadResume({
  projectId,
  runId,
  sessions,
  selectedFile,
  onMatched,
  enqueue,
  discardSession,
}: {
  projectId: string;
  runId: string | null;
  /** Unfinished uploads of this Run (or of no Run) that are not already in the queue. */
  sessions: ArtifactUploadListItem[];
  /** The one file chosen with the file picker, or null for none or several. */
  selectedFile: File | null;
  /** Called once per match, to fill in the session's path. */
  onMatched: (match: ResumeMatch) => void;
  enqueue: (entries: UploadEntry[]) => void;
  discardSession: (uploadId: string) => Promise<void>;
}) {
  // A list reload compares the file again; the path is filled only for a new match, so a path the
  // person edited afterwards stays.
  const filledMatchRef = useRef<{ file: File; uploadId: string } | null>(null);
  // The list loads after the dialog opens, so a file chosen early is compared again once it arrives.
  const comparedSessionsKey = `${projectId}:${runId}:${sessions.map((session) => session.id).join(',')}`;
  const [comparison, setComparison] = useState<{
    file: File;
    comparedSessionsKey: string;
    resume: SelectedFileResume;
  } | null>(null);
  // Only a session of the same size can hold the file; without one there is nothing to compare.
  const hasSessionOfFileSize =
    selectedFile !== null && sessions.some((session) => session.expectedSize === selectedFile.size);
  const selectedFileResume: SelectedFileResume = !hasSessionOfFileSize
    ? IDLE_RESUME
    : comparison?.file === selectedFile && comparison.comparedSessionsKey === comparedSessionsKey
      ? comparison.resume
      : CHECKING_RESUME;

  const findSelectedFileMatch = useEffectEvent((file: File, signal: AbortSignal) => {
    const recordedUploadIds = findUploadIdsRecordedForFile({
      projectId,
      runId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    });
    const candidates = orderResumeCandidates({
      sessions,
      fileSize: file.size,
      recordedUploadIds,
      now: Date.now(),
    });
    return findMatchingSession({ projectId, file, candidates, recordedUploadIds, signal });
  });
  const fillMatchedPath = useEffectEvent((file: File, match: ResumeMatch) => {
    const filled = filledMatchRef.current;
    if (filled?.file === file && filled.uploadId === match.uploadId) return;
    filledMatchRef.current = { file, uploadId: match.uploadId };
    onMatched(match);
  });
  useEffect(() => {
    if (!selectedFile || !hasSessionOfFileSize) return;
    const controller = new AbortController();
    void findSelectedFileMatch(selectedFile, controller.signal)
      // Without an answer from the server the file simply goes up as a new upload.
      .catch(() => null)
      .then((match) => {
        if (controller.signal.aborted) return;
        setComparison({
          file: selectedFile,
          comparedSessionsKey,
          resume: match ? { status: 'matched', match } : IDLE_RESUME,
        });
        if (match) fillMatchedPath(selectedFile, match);
      });
    return () => controller.abort();
  }, [selectedFile, hasSessionOfFileSize, comparedSessionsKey]);

  /** Compares the file with the session and continues it, or tells why it cannot continue. */
  const continueSession = useCallback(
    async (session: ArtifactUploadListItem, source: UploadSource): Promise<ResumeBlocker | null> => {
      const inspection = await inspectSessionForFile({
        uploadId: session.id,
        file: source.file,
        loadSession: (uploadId) => artifactUploadsApi.get(projectId, uploadId),
        readPartDigest: createPartDigestReader(source.file),
        now: Date.now(),
      });
      if (inspection.blocker) return inspection.blocker;
      enqueue([{ source, path: inspection.session.path, verifiedUploadId: session.id }]);
      return null;
    },
    [enqueue, projectId],
  );

  /** Sends the file from the first byte to the session's path and discards what the session kept. */
  const startOver = useCallback(
    (session: ArtifactUploadListItem, source: UploadSource) => {
      enqueue([{ source, path: session.path }]);
      // An expired session still holds storage until the sweeper runs; a gone one has nothing left.
      void discardSession(session.id).catch(() => undefined);
    },
    [discardSession, enqueue],
  );

  return { selectedFileResume, continueSession, startOver };
}

// The first candidate session that holds this file's bytes, or null (at once with no candidates).
async function findMatchingSession({
  projectId,
  file,
  candidates,
  recordedUploadIds,
  signal,
}: {
  projectId: string;
  file: File;
  candidates: ArtifactUploadListItem[];
  recordedUploadIds: ReadonlySet<string>;
  signal: AbortSignal;
}): Promise<ResumeMatch | null> {
  const readPartDigest: PartDigestReader = createPartDigestReader(file);
  for (const candidate of candidates) {
    const inspection = await inspectSessionForFile({
      uploadId: candidate.id,
      file,
      loadSession: (uploadId) => artifactUploadsApi.get(projectId, uploadId, signal),
      readPartDigest,
      now: Date.now(),
    });
    if (signal.aborted) return null;
    if (inspection.blocker !== null) continue;
    // With nothing stored yet, only this browser's own record ties the file to the session.
    if (inspection.nothingSent && !recordedUploadIds.has(candidate.id)) continue;
    const { session } = inspection;
    return {
      uploadId: session.id,
      path: session.path,
      receivedBytes: session.receivedParts.reduce((total, part) => total + part.size, 0),
      expectedSize: session.expectedSize,
    };
  }
  return null;
}
