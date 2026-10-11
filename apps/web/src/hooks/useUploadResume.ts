// Resume decisions of the upload dialog: finds the unfinished upload of a newly chosen file so its
// path is filled in, and continues or restarts the unfinished upload a person picked a file for.
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [selectedFileResume, setSelectedFileResume] = useState<SelectedFileResume>({ status: 'idle' });
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const onMatchedRef = useRef(onMatched);
  onMatchedRef.current = onMatched;
  // A list reload compares the file again; the path is filled only for a new match, so a path the
  // person edited afterwards stays.
  const filledMatchRef = useRef<{ file: File; uploadId: string } | null>(null);
  // The list loads after the dialog opens, so a file chosen early is compared again once it arrives.
  const sessionIdsKey = sessions.map((session) => session.id).join(',');

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFileResume({ status: 'idle' });
      return;
    }
    const recordedUploadIds = findUploadIdsRecordedForFile({
      projectId,
      runId,
      name: selectedFile.name,
      size: selectedFile.size,
      lastModified: selectedFile.lastModified,
    });
    const candidates = orderResumeCandidates({
      sessions: sessionsRef.current,
      fileSize: selectedFile.size,
      recordedUploadIds,
      now: Date.now(),
    });
    if (candidates.length === 0) {
      setSelectedFileResume({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setSelectedFileResume({ status: 'checking' });
    void findMatchingSession({ projectId, file: selectedFile, candidates, recordedUploadIds, signal: controller.signal })
      // Without an answer from the server the file simply goes up as a new upload.
      .catch(() => null)
      .then((match) => {
        if (controller.signal.aborted) return;
        setSelectedFileResume(match ? { status: 'matched', match } : { status: 'idle' });
        const filled = filledMatchRef.current;
        if (!match || (filled?.file === selectedFile && filled.uploadId === match.uploadId)) return;
        filledMatchRef.current = { file: selectedFile, uploadId: match.uploadId };
        onMatchedRef.current(match);
      });
    return () => controller.abort();
  }, [projectId, runId, selectedFile, sessionIdsKey]);

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
