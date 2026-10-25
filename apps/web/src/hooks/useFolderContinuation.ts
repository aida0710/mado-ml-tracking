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

/** 選んだフォルダが続きになる止まったアップロードと、それが既に持っているフォルダの中身。 */
export interface FolderContinuation {
  upload: UnfinishedFolderUpload;
  storedFiles: StoredFolderFile[];
  /** 止まったアップロードが同じパスとサイズで持っている選んだファイル。バイト列は始めるときに比べる。 */
  matchedCount: number;
}

type ContinuationCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ready'; continuation: FolderContinuation | null }
  | { status: 'failed'; failure: unknown };

/**
 * 選んだフォルダが止まったアップロードの続きになるかを決める。フォルダを選ぶと止まったアップロードの
 * すべてと比べ、ファイルを最も多く持つものを選ぶ。行の[続きを送る]は、そのアップロードを名指しする。
 * どちらも断ることができ、そのときフォルダは新しいアップロードとして送る。
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
  // どちらも1回のファイルの選択に属するので、別のフォルダを選ぶと忘れる。
  const [chosenFolder, setChosenFolder] = useState<{ sources: UploadSource[]; folder: string } | null>(null);
  const [declinedSources, setDeclinedSources] = useState<UploadSource[] | null>(null);
  const folder = chosenFolder?.sources === sources ? chosenFolder.folder : null;
  const isDeclined = declinedSources === sources;
  const uploadsKey = uploads.map((upload) => `${upload.folder}:${upload.storedFileCount}:${upload.openUploads.length}`).join(',');
  const candidates = folder ? uploads.filter((upload) => upload.folder === folder) : uploads;
  // 何も読まずに決まる場合（ファイルを選んでいない、続きを断った、続きにできるものが無い）。
  const decidedCheck: ContinuationCheck | null =
    sources.length === 0
      ? { status: 'idle' }
      : isDeclined || candidates.length === 0
        ? { status: 'ready', continuation: null }
        : null;
  // 最後の比較の答えと、それがどの選択に対するものか。
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

  // 最新のレンダリングの止まったアップロードを読む。uploadsはuploadsKeyで比べるので、同じ
  // アップロードのまま読み直しても何も変わらない。
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
        // 名指しされたアップロードは、まだ何も一致しなくても続きにする。そのときはお知らせにそう出す。
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
    // ここで文にするので、後で表示言語を変えるとメッセージにも反映される。
    error: check.status === 'failed' ? formatErrorMessage(check.failure) : null,
    /** 行から選んだフォルダで、このアップロードの続きを送る。 */
    continueUpload: (upload: UnfinishedFolderUpload, chosen: UploadSource[]) => {
      setDeclinedSources(null);
      setChosenFolder({ sources: chosen, folder: upload.folder });
    },
    /** 選んだフォルダを、止まったアップロードとは別の新しいアップロードとして送る。 */
    startNew: () => {
      setChosenFolder(null);
      setDeclinedSources(sources);
    },
  };
}
