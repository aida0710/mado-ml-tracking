import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Artifact, ArtifactUpload, ArtifactUploadDetail } from '@mmt/contracts';
import { isApiError } from '@mado/design-system/http';
import { artifactUploadsApi } from '../api/artifactUploads';
import { trackingApi } from '../api/tracking';
import { canDigest, sha256Hex } from '../lib/blobDigest';
import type { UploadSource } from '../lib/droppedFiles';
import { LocalizedError } from '../lib/localizedError';
import type { UploadFailure } from '../types/uploadFailure';
import {
  canRetry,
  choosePartSize,
  MAX_PART_ATTEMPTS,
  chooseUploadMethod,
  estimateRemainingSeconds,
  estimateTransferRate,
  findMissingParts,
  isRetryableFailure,
  planParts,
  recordTransferSample,
  retryDelayMs,
  sumPartBytes,
  type PartRange,
  type TransferSample,
  type UploadMethod,
} from '../lib/uploadPlan';
import { explainUploadFailure } from '../lib/uploadFailure';
import { blockerFromFailure, isSessionUnusable } from '../lib/uploadResumeBlocker';
import { createPartDigestReader, inspectSessionForFile } from '../lib/uploadResumeMatch';
import { findResumeRecord, removeResumeRecord, saveResumeRecord } from '../lib/uploadResumeStore';
import { useQuery } from './useQuery';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { useLatestRef } from './useLatestRef';

/**
 * キュー全体で同時に送る要求の数。ブラウザはHTTP/1.1では同じオリジンへの接続を6本まで許す。3本なら
 * 回線を使い続けながら、ページのポーリングやプレビューの分の余裕を残せる。
 */
export const MAX_CONCURRENT_REQUESTS = 3;
// finalizerがオブジェクト全体のハッシュを取る。終わったことを出すには1秒に1回で足りる。
const VERIFY_POLL_INTERVAL_MS = 1000;
// 進み具合のイベントは1秒に何度も届く。一覧の描き直しは多くてもこの間隔に1回にする。
const PROGRESS_RENDER_INTERVAL_MS = 200;

export type UploadItemStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'verifying'
  | 'paused'
  | 'failed'
  | 'canceled'
  | 'completed';

const ACTIVE_STATUSES: ReadonlySet<UploadItemStatus> = new Set(['queued', 'preparing', 'uploading', 'verifying']);

/** ネットワークで失敗し、これから送り直す要求。 */
export interface UploadRetry {
  /** これから始める送信が何回目か。2から数える。 */
  attempt: number;
  maxAttempts: number;
}

/** キューのパネルが1つのファイルについて出すもの。 */
export interface UploadItem {
  id: string;
  name: string;
  path: string;
  size: number;
  method: UploadMethod;
  status: UploadItemStatus;
  sentBytes: number;
  /** 再開したときにサーバーが既に持っていたバイト数。この分は送り直していない。 */
  resumedBytes: number;
  bytesPerSecond: number | null;
  remainingSeconds: number | null;
  /** 失敗した要求が送り直しを待つ間だけ入る。その間は速さと残り時間が分からない。 */
  retry: UploadRetry | null;
  error: UploadFailure | null;
  artifact: Artifact | null;
}

export interface UploadEntry {
  source: UploadSource;
  path: string;
  /** ダイアログがこのファイルと比べ済みのセッション。もう一度比べずに続きから送る。 */
  verifiedUploadId?: string;
}

/** 要求を送っている間の、1つのファイルの書き換えられる状態。UploadItemはその描画用の写し。 */
interface UploadJob {
  id: string;
  source: UploadSource;
  path: string;
  method: UploadMethod;
  status: UploadItemStatus;
  session: ArtifactUpload | null;
  verifiedUploadId: string | null;
  pendingParts: PartRange[];
  /** 送信中の各partの要求が、ここまでに送ったバイト数。 */
  inFlightParts: Map<number, number>;
  confirmedBytes: number;
  resumedBytes: number;
  samples: TransferSample[];
  /** 始めるたびに作り直すので、一時停止や取り消しをした回の要求は何も変えない。 */
  controller: AbortController;
  retry: UploadRetry | null;
  error: UploadFailure | null;
  artifact: Artifact | null;
}

export function useArtifactUploadQueue({
  projectId,
  runId,
  onCompleted,
}: {
  projectId: string;
  runId: string | null;
  onCompleted: (artifact: Artifact) => void;
}) {
  useLocale();
  const jobsRef = useRef<UploadJob[]>([]);
  const activeRequestsRef = useRef(0);
  const nextJobNumberRef = useRef(1);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // このキューが引き継いだセッション。サーバーの一覧は読み直さないので、ここで隠す。
  const [queuedSessionIds, setQueuedSessionIds] = useState<ReadonlySet<string>>(() => new Set());
  const rememberQueuedSession = useCallback(
    (uploadId: string) =>
      setQueuedSessionIds((previous) => (previous.has(uploadId) ? previous : new Set(previous).add(uploadId))),
    [],
  );
  const onCompletedRef = useLatestRef(onCompleted);
  const [items, setItems] = useState<UploadItem[]>([]);
  const openSessions = useQuery({ key: `${projectId}:artifact-uploads:open`, load: (signal) =>
    artifactUploadsApi.list(projectId, 'open', signal),
  });
  const runOpenSessions = useMemo(
    () => (openSessions.value ?? []).filter((session) => session.runId === runId),
    [openSessions.value, runId],
  );
  // 送信を始めるときに読む。ダイアログが最後に描画されてから、だいぶ経っていることもある。
  const openSessionsRef = useLatestRef(runOpenSessions);

  const render = useCallback(() => {
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    renderTimerRef.current = null;
    const now = Date.now();
    setItems(jobsRef.current.map((job) => toItem(job, now)));
  }, []);
  const renderSoon = useCallback(() => {
    renderTimerRef.current ??= setTimeout(render, PROGRESS_RENDER_INTERVAL_MS);
  }, [render]);

  // 下のコールバックはrefだけを参照するので、ダイアログが開いている間ずっと有効なままになる。
  const failJob = useCallback(
    (job: UploadJob, failure: unknown) => {
      // 開いているセッションへの要求が断られたときだけ、そのセッションのことを表す。作成時や単発の
      // PUTでRunが見つからないのは「アップロードが無くなった」ではない。
      const blocker = job.session ? blockerFromFailure(failure) : null;
      const startsOver = blocker !== null && isSessionUnusable(blocker);
      if (startsOver && job.session) {
        removeResumeRecord(job.session.id);
        job.session = null;
        job.verifiedUploadId = null;
      }
      job.controller.abort();
      job.status = 'failed';
      job.retry = null;
      job.error = {
        kind: 'request',
        cause: explainUploadFailure({ failure, blocker, startsOver, method: job.method }),
      };
      job.pendingParts = [];
      job.inFlightParts.clear();
      render();
    },
    [render],
  );

  const finishCompleted = useCallback(
    (job: UploadJob, artifact: Artifact) => {
      job.status = 'completed';
      job.artifact = artifact;
      job.confirmedBytes = job.source.file.size;
      render();
      onCompletedRef.current(artifact);
    },
    [onCompletedRef, render],
  );

  const finalize = useCallback(
    async (job: UploadJob, session: ArtifactUpload) => {
      const { signal } = job.controller;
      job.status = 'verifying';
      render();
      try {
        let current: ArtifactUpload = session.status === 'open'
          ? await artifactUploadsApi.complete(projectId, session.id, signal)
          : session;
        while (current.status === 'verifying') {
          await waitFor(VERIFY_POLL_INTERVAL_MS, signal);
          current = await artifactUploadsApi.get(projectId, session.id, signal);
        }
        // 完了したセッションはArtifactを読むまで参照を残し、再開でその読み込みをやり直せるようにする。
        const artifact = current.status === 'completed' && current.artifactId
          ? await trackingApi.artifact(projectId, current.artifactId, signal)
          : null;
        removeResumeRecord(session.id);
        job.session = null;
        if (!artifact) {
          const reason = current.error ?? current.status;
          throw new LocalizedError(() => `${text.uploadVerificationFailed} (${reason})`);
        }
        finishCompleted(job, artifact);
      } catch (failure) {
        if (!signal.aborted) failJob(job, failure);
      }
    },
    [failJob, finishCompleted, projectId, render],
  );

  const showRetry = useCallback(
    (job: UploadJob, retry: UploadRetry) => {
      // 要求がまた通るようになったら、速さを測り直す。
      job.retry = retry;
      job.samples = [];
      render();
    },
    [render],
  );

  const sendPart = useCallback(
    async (job: UploadJob, part: PartRange) => {
      const { signal } = job.controller;
      const session = job.session;
      if (!session) return;
      try {
        await retrying(signal, async () => {
          // 最初のawaitの前に入れ、最後に終わるpartから、ほかのpartが送信中だと分かるようにする。
          job.inFlightParts.set(part.partNumber, 0);
          const slice = job.source.file.slice(part.start, part.end);
          const bytes = canDigest() ? await slice.arrayBuffer() : null;
          await artifactUploadsApi.putPart(
            {
              projectId,
              uploadId: session.id,
              partNumber: part.partNumber,
              body: bytes ?? slice,
              sha256: bytes ? await sha256Hex(bytes) : null,
            },
            {
              signal,
              onProgress: (sentBytes) => {
                job.inFlightParts.set(part.partNumber, sentBytes);
                renderSoon();
              },
            },
          );
        }, (retry) => {
          // 失敗した要求のバイトは受け取られていないので、最初から送り直す。
          job.inFlightParts.set(part.partNumber, 0);
          showRetry(job, retry);
        });
      } catch (failure) {
        if (!signal.aborted) failJob(job, failure);
        return;
      }
      if (signal.aborted) return;
      // partが1つ通ったので、ほかのpartがまだ待っていても接続は戻っている。
      job.retry = null;
      job.inFlightParts.delete(part.partNumber);
      job.confirmedBytes += part.end - part.start;
      renderSoon();
      if (job.pendingParts.length === 0 && job.inFlightParts.size === 0) void finalize(job, session);
    },
    [failJob, finalize, projectId, renderSoon, showRetry],
  );

  const sendSingle = useCallback(
    async (job: UploadJob) => {
      const { signal } = job.controller;
      job.status = 'uploading';
      render();
      try {
        const artifact = await retrying(
          signal,
          () =>
            artifactUploadsApi.putSingle(
              { projectId, runId, path: job.path, file: job.source.file },
              {
                signal,
                onProgress: (sentBytes) => {
                  job.inFlightParts.set(1, sentBytes);
                  renderSoon();
                },
              },
            ),
          (retry) => {
            job.inFlightParts.set(1, 0);
            showRetry(job, retry);
          },
        );
        if (signal.aborted) return;
        job.inFlightParts.clear();
        finishCompleted(job, artifact);
      } catch (failure) {
        if (!signal.aborted) failJob(job, failure);
      }
    },
    [failJob, finishCompleted, projectId, render, renderSoon, runId, showRetry],
  );

  const prepareSession = useCallback(
    async (job: UploadJob) => {
      const { signal } = job.controller;
      try {
        const file = job.source.file;
        const identity = { projectId, runId, path: job.path, name: file.name, size: file.size, lastModified: file.lastModified };
        const storedRecord = findResumeRecord(identity);
        const resumable = await findResumableSession({
          projectId,
          file,
          candidates: [
            ...(job.session ? [{ uploadId: job.session.id, isSameFile: true }] : []),
            ...(job.verifiedUploadId ? [{ uploadId: job.verifiedUploadId, isSameFile: true }] : []),
            ...(storedRecord ? [{ uploadId: storedRecord.uploadId, isSameFile: false }] : []),
            ...openSessionsRef.current
              .filter((session) => session.path === job.path && session.expectedSize === file.size)
              .map((session) => ({ uploadId: session.id, isSameFile: false })),
          ],
          signal,
        });
        if (signal.aborted) return;
        const session = resumable ?? await artifactUploadsApi.create(
          projectId,
          {
            path: job.path,
            ...(runId ? { runId } : {}),
            ...(file.type ? { mimeType: file.type } : {}),
            expectedSize: file.size,
            partSize: choosePartSize(file.size),
          },
          signal,
        );
        if (signal.aborted) return;
        job.session = session;
        rememberQueuedSession(session.id);
        saveResumeRecord({ uploadId: session.id, ...identity });
        if (session.status !== 'open') {
          void finalize(job, session);
          return;
        }
        const receivedPartNumbers = 'receivedParts' in session
          ? (session as ArtifactUploadDetail).receivedParts.map((part) => part.partNumber)
          : [];
        const parts = planParts(file.size, session.partSize);
        const missing = findMissingParts(parts, receivedPartNumbers);
        job.confirmedBytes = file.size - sumPartBytes(missing);
        job.resumedBytes = job.confirmedBytes;
        job.samples = [];
        job.pendingParts = missing;
        job.status = 'uploading';
        render();
        if (missing.length === 0) void finalize(job, session);
      } catch (failure) {
        if (!signal.aborted) failJob(job, failure);
      }
    },
    [failJob, finalize, openSessionsRef, projectId, rememberQueuedSession, render, runId],
  );

  const pump = useCallback(() => {
    // 要求が1つ終わるたびに、次の処理を始める。
    function startTasks() {
      while (activeRequestsRef.current < MAX_CONCURRENT_REQUESTS) {
        const task = takeNextTask(jobsRef.current, { prepareSession, sendPart, sendSingle });
        if (!task) break;
        activeRequestsRef.current += 1;
        void task().finally(() => {
          activeRequestsRef.current -= 1;
          startTasks();
        });
      }
      render();
    }
    startTasks();
  }, [prepareSession, render, sendPart, sendSingle]);

  const enqueue = useCallback(
    (entries: UploadEntry[]) => {
      for (const { source, path, verifiedUploadId } of entries) {
        // セッションを読み直した後でなく、すぐに未完了の一覧から隠す。
        if (verifiedUploadId) rememberQueuedSession(verifiedUploadId);
        jobsRef.current.push({
          id: String(nextJobNumberRef.current++),
          source,
          path,
          method: chooseUploadMethod(source.file.size),
          status: 'queued',
          session: null,
          verifiedUploadId: verifiedUploadId ?? null,
          pendingParts: [],
          inFlightParts: new Map(),
          confirmedBytes: 0,
          resumedBytes: 0,
          samples: [],
          controller: new AbortController(),
          retry: null,
          error: null,
          artifact: null,
        });
      }
      pump();
    },
    [pump, rememberQueuedSession],
  );

  const findJob = (id: string) => jobsRef.current.find((job) => job.id === id);

  /** 送信を止めるがセッションは残すので、再開ではサーバーに無いpartだけを送る。 */
  const pause = useCallback(
    (id: string) => {
      const job = findJob(id);
      if (!job || !['queued', 'preparing', 'uploading'].includes(job.status)) return;
      stopRequests(job);
      job.status = 'paused';
      pump();
    },
    [pump],
  );

  /** 一時停止・失敗したファイルはセッションの続きから送る。取り消したファイルは最初のバイトからやり直す。 */
  const resume = useCallback(
    (id: string) => {
      const job = findJob(id);
      if (!job || (job.status !== 'paused' && job.status !== 'failed' && job.status !== 'canceled')) return;
      if (job.status === 'canceled') {
        job.confirmedBytes = 0;
        job.resumedBytes = 0;
      }
      job.controller = new AbortController();
      job.status = 'queued';
      job.retry = null;
      job.error = null;
      pump();
    },
    [pump],
  );

  const retryFailed = useCallback(() => {
    for (const job of jobsRef.current) if (job.status === 'failed') resume(job.id);
  }, [resume]);

  /** ファイルの送信を止め、サーバーが受け取った分を捨てる（DELETE）。Artifactはできない。 */
  const cancel = useCallback(
    async (id: string) => {
      const job = findJob(id);
      if (!job || job.status === 'completed' || job.status === 'canceled' || job.status === 'verifying') return;
      stopRequests(job);
      job.status = 'canceled';
      const session = job.session;
      job.session = null;
      pump();
      if (!session) return;
      removeResumeRecord(session.id);
      try {
        await artifactUploadsApi.abort(projectId, session.id);
      } catch (failure) {
        // 既に閉じたセッションは何も残さない。それ以外は、セッションと一緒に期限が切れて消える。
        if (!(isApiError(failure) && failure.code === 'upload_not_open')) {
          job.error = { kind: 'cancel', cause: failure };
          render();
        }
      }
    },
    [projectId, pump, render],
  );

  const discardSession = useCallback(
    async (uploadId: string) => {
      removeResumeRecord(uploadId);
      try {
        await artifactUploadsApi.abort(projectId, uploadId);
      } catch (failure) {
        // 既に無くなったセッションには、捨てるものが残っていない。
        if (blockerFromFailure(failure) !== 'gone') throw failure;
      }
      openSessions.reload();
    },
    [openSessions, projectId],
  );

  const isActive = items.some((item) => ACTIVE_STATUSES.has(item.status));
  useEffect(() => {
    if (!isActive) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isActive]);

  // ダイアログを離れると要求は止まる。開いているセッションはサーバーに残り、後で再開できる。
  useEffect(
    () => () => {
      for (const job of jobsRef.current) job.controller.abort();
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    },
    [],
  );

  return {
    items,
    isActive,
    enqueue,
    pause,
    resume,
    cancel,
    retryFailed,
    resumableSessions: runOpenSessions.filter((session) => !queuedSessionIds.has(session.id)),
    resumableSessionsError: openSessions.error,
    discardSession,
  };
}

function toItem(job: UploadJob, now: number): UploadItem {
  const inFlightBytes = [...job.inFlightParts.values()].reduce((total, bytes) => total + bytes, 0);
  const sentBytes = Math.min(job.source.file.size, job.confirmedBytes + inFlightBytes);
  const isSending = job.status === 'uploading' && job.retry === null;
  if (isSending) job.samples = recordTransferSample(job.samples, { at: now, bytes: sentBytes });
  const bytesPerSecond = isSending ? estimateTransferRate(job.samples) : null;
  return {
    id: job.id,
    name: job.source.file.name,
    path: job.path,
    size: job.source.file.size,
    method: job.method,
    status: job.status,
    sentBytes,
    resumedBytes: job.resumedBytes,
    bytesPerSecond,
    remainingSeconds: estimateRemainingSeconds(job.source.file.size - sentBytes, bytesPerSecond),
    retry: job.status === 'uploading' || job.status === 'preparing' ? job.retry : null,
    error: job.error,
    artifact: job.artifact,
  };
}

function stopRequests(job: UploadJob) {
  job.controller.abort();
  job.retry = null;
  job.pendingParts = [];
  job.inFlightParts.clear();
  job.samples = [];
}

/** キューの順で次に送る要求。準備は先に来たファイルから行い、空いた枠はpartで埋める。 */
function takeNextTask(
  jobs: UploadJob[],
  handlers: {
    prepareSession: (job: UploadJob) => Promise<void>;
    sendPart: (job: UploadJob, part: PartRange) => Promise<void>;
    sendSingle: (job: UploadJob) => Promise<void>;
  },
): (() => Promise<void>) | null {
  for (const job of jobs) {
    if (job.status === 'queued') {
      job.status = 'preparing';
      return job.method === 'single' ? () => handlers.sendSingle(job) : () => handlers.prepareSession(job);
    }
    const part = job.status === 'uploading' ? job.pendingParts.shift() : undefined;
    if (part) return () => handlers.sendPart(job, part);
  }
  return null;
}

/**
 * 候補のセッションのうち、このファイルにまだ使える最初のものを選ぶ。このキューがこのファイル
 * そのもので開いたのではないセッション（手元の記録や、サーバーにだけ見つかったもの）は、同じ
 * パスとサイズの別のファイルのものかもしれないので、受け取ったpartが選んだファイルと一致する
 * 必要がある。
 */
async function findResumableSession({
  projectId,
  file,
  candidates,
  signal,
}: {
  projectId: string;
  file: File;
  candidates: { uploadId: string; isSameFile: boolean }[];
  signal: AbortSignal;
}): Promise<ArtifactUploadDetail | null> {
  const readPartDigest = createPartDigestReader(file);
  const tried = new Set<string>();
  for (const { uploadId, isSameFile } of candidates) {
    if (tried.has(uploadId)) continue;
    tried.add(uploadId);
    const inspection = await inspectSessionForFile({
      uploadId,
      file,
      loadSession: (id) => artifactUploadsApi.get(projectId, id, signal),
      readPartDigest,
      now: Date.now(),
      isKnownSameFile: isSameFile,
    });
    // 完了したセッションはそのArtifactを渡すので、確かめていないファイルがそれを受け取るのは、
    // partを比べた後だけ。まだpartの無いセッションは、ファイルについて何の裏付けにもならない。
    const isUsable =
      inspection.blocker === null &&
      (isSameFile || inspection.session.status === 'open' || !inspection.nothingSent);
    if (isUsable) return inspection.session;
    // まだ続けられるセッション（正しいファイルなら、またはアクセスが戻れば）の記録は残し、
    // ダイアログがそのファイル名を出し続けられるようにする。
    if (inspection.blocker && isSessionUnusable(inspection.blocker)) removeResumeRecord(uploadId);
  }
  return null;
}

async function retrying<T>(
  signal: AbortSignal,
  send: () => Promise<T>,
  onRetry: (retry: UploadRetry) => void,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send();
    } catch (failure) {
      const isRetryable = isApiError(failure) && isRetryableFailure(failure) && canRetry(attempt);
      if (signal.aborted || !isRetryable) throw failure;
      onRetry({ attempt: attempt + 1, maxAttempts: MAX_PART_ATTEMPTS });
      await waitFor(retryDelayMs(attempt), signal);
    }
  }
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, milliseconds);
    function stop() {
      clearTimeout(timer);
      reject(new DOMException('Upload aborted', 'AbortError'));
    }
    signal.addEventListener('abort', stop, { once: true });
  });
}
