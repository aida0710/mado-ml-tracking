// アップロードのダイアログの再開の判断。新しく選んだファイルの未完了のアップロードを見つけて
// パスを埋め、利用者がファイルを選んだ未完了のアップロードを続けるか、やり直す。
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

/** 選んだファイルの未完了のアップロードと、今サーバーがそれについて持っている分。 */
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
  /** このRun（Runが無ければRunに属さないもの）の未完了のアップロードのうち、まだキューに無いもの。 */
  sessions: ArtifactUploadListItem[];
  /** ファイルの選択で選んだ1つのファイル。選んでいないか複数ならnull。 */
  selectedFile: File | null;
  /** 一致したものごとに1回呼び、セッションのパスを埋める。 */
  onMatched: (match: ResumeMatch) => void;
  enqueue: (entries: UploadEntry[]) => void;
  discardSession: (uploadId: string) => Promise<void>;
}) {
  // 一覧を読み直すとファイルをもう一度比べる。パスを埋めるのは新しく一致したときだけなので、
  // 利用者が後から編集したパスは残る。
  const filledMatchRef = useRef<{ file: File; uploadId: string } | null>(null);
  // 一覧はダイアログを開いた後に読み込まれるので、早く選んだファイルは一覧が届いたらもう一度比べる。
  const comparedSessionsKey = `${projectId}:${runId}:${sessions.map((session) => session.id).join(',')}`;
  const [comparison, setComparison] = useState<{
    file: File;
    comparedSessionsKey: string;
    resume: SelectedFileResume;
  } | null>(null);
  // ファイルを持てるのは同じサイズのセッションだけ。それが無ければ比べるものが無い。
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
      // サーバーから答えが無ければ、ファイルはそのまま新しいアップロードとして送る。
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

  /** ファイルをセッションと比べて続きを送るか、続けられない理由を伝える。 */
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

  /** ファイルを最初のバイトからセッションのパスへ送り、セッションが持っていた分を破棄する。 */
  const startOver = useCallback(
    (session: ArtifactUploadListItem, source: UploadSource) => {
      enqueue([{ source, path: session.path }]);
      // 期限切れのセッションも、sweeperが動くまでは保存領域を使っている。無くなったセッションには
      // 何も残っていない。
      void discardSession(session.id).catch(() => undefined);
    },
    [discardSession, enqueue],
  );

  return { selectedFileResume, continueSession, startOver };
}

// このファイルのバイト列を持つ最初の候補のセッション。無ければnull（候補が無ければすぐに）。
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
    // まだ何も保存されていなければ、ファイルとセッションを結び付けるのは、このブラウザ自身の記録だけ。
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
