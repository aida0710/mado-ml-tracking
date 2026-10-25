import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Dataset, DatasetVersion, JsonObject } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import {
  createDatasetFolderUploadFolder,
  datasetFolderProgress,
  planDatasetFolder,
  type DatasetFolderEntry,
} from '../lib/datasetFolder';
import { pairWithStoredFiles, type StoredFolderFile } from '../lib/datasetFolderResume';
import type { UploadSource } from '../lib/droppedFiles';
import { sha256OfFile } from '../lib/fileSha256';
import { useArtifactUploadQueue } from './useArtifactUploadQueue';
import { useMutation } from './useMutation';
import { useLatestRef } from './useLatestRef';

/** すべてのアップロードが終わったときに、ファイルの一覧と一緒に送るバージョンの項目。 */
export interface DatasetFolderVersionFields {
  /** undefinedなら、次の整数のバージョンになる。 */
  version?: string;
  metadata: JsonObject;
  parentDatasetVersionIds: string[];
}

/** このフォルダのアップロードのうちバージョンを作る前に止まったものと、それが保存したファイル。 */
export interface DatasetFolderContinuation {
  folder: string;
  storedFiles: StoredFolderFile[];
}

/** 選んだファイルと、前のアップロードが保存したファイルとの比較が、どこまで進んだか。 */
export interface DatasetFolderMatching {
  checked: number;
  total: number;
}

/**
 * フォルダを再開できるキューでRunに属さないArtifactとしてアップロードし、完了したArtifactのIDから
 * 'artifacts'のDatasetVersionを作る。すべてのファイルを保存したら作成は自動で始まる。作成に
 * 失敗したら手でやり直し、アップロードは繰り返さない。止まったファイル（失敗・一時停止・取り消し）が
 * あると、送り直すか外すまでバージョンは作らない。前のアップロードの続きを送るときはそのフォルダへ
 * アップロードするので、保存済みでバイト列が一致するファイルはそのまま一覧に入れ、開いている
 * アップロードはサーバーが持つpartの続きから送る。
 */
export function useDatasetFolderVersion({
  projectId,
  dataset,
  onCreated,
}: {
  projectId: string;
  dataset: Dataset;
  onCreated: (version: DatasetVersion) => void;
}) {
  const queue = useArtifactUploadQueue({ projectId, runId: null, onCompleted: () => undefined });
  const creation = useMutation();
  const [entries, setEntries] = useState<DatasetFolderEntry[]>([]);
  const [matching, setMatching] = useState<DatasetFolderMatching | null>(null);
  const fieldsRef = useRef<DatasetFolderVersionFields | null>(null);
  const attemptedRef = useRef(false);
  const matchingControllerRef = useRef<AbortController | null>(null);
  // 要求の後で読む。その間にダイアログが新しいコールバックで描画し直されているかもしれない。
  const onCreatedRef = useLatestRef(onCreated);

  const { storedArtifactIds, unfinishedItemIds, isUploaded } = datasetFolderProgress(entries, queue.items);
  const isWaitingForChoice = !queue.isActive && unfinishedItemIds.length > 0;
  const reusedEntries = entries.filter((entry) => entry.storedArtifactId);

  async function start(
    sources: UploadSource[],
    fields: DatasetFolderVersionFields,
    continuation: DatasetFolderContinuation | null,
  ) {
    const folder = continuation?.folder ?? createDatasetFolderUploadFolder(new Date());
    const planned = planDatasetFolder(sources, { datasetId: dataset.id, folder });
    fieldsRef.current = fields;
    attemptedRef.current = false;
    if (continuation) {
      const controller = new AbortController();
      matchingControllerRef.current = controller;
      const reused = await findStoredCopies({
        pairs: pairWithStoredFiles(planned, continuation.storedFiles),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setMatching(progress);
        },
      });
      if (controller.signal.aborted) return;
      matchingControllerRef.current = null;
      setMatching(null);
      for (const entry of planned) {
        const storedArtifactId = reused.get(entry);
        if (storedArtifactId) entry.storedArtifactId = storedArtifactId;
      }
    }
    setEntries(planned);
    queue.enqueue(
      planned
        .filter((entry) => !entry.storedArtifactId)
        .map((entry) => ({ source: entry.source, path: entry.artifactPath })),
    );
  }

  async function create() {
    const fields = fieldsRef.current;
    if (!fields) return;
    attemptedRef.current = true;
    const version = await creation.run(() =>
      registryApi.createDatasetVersion(projectId, dataset.id, {
        ...fields,
        content: {
          kind: 'artifacts',
          files: entries.map((entry) => ({
            path: entry.datasetPath,
            artifactId: storedArtifactIds.get(entry.artifactPath)!,
          })),
        },
      }),
    );
    if (version) onCreatedRef.current(version);
  }

  /**
   * 比較のための選んだファイルの読み込みを止め、始める前に戻る。まだ何も送っていないので、
   * フォルダをもう一度始めることも、新しく送ることもできる。
   */
  function cancelMatching() {
    matchingControllerRef.current?.abort();
    matchingControllerRef.current = null;
    fieldsRef.current = null;
    setMatching(null);
  }

  /** 止まったファイルをすべて送り直す。取り消したものは最初から送る。 */
  function resendUnfinished() {
    for (const id of unfinishedItemIds) queue.resume(id);
  }

  /** 保存済みのファイルだけでバージョンを作る。残りの開いているセッションは破棄する。 */
  function createWithoutUnfinished() {
    for (const id of unfinishedItemIds) void queue.cancel(id);
    setEntries((previous) => previous.filter((entry) => storedArtifactIds.has(entry.artifactPath)));
  }

  // 最新のentriesとキューの状態を読む。アップロードが終わったときに1回だけ動く。
  const createOnceUploaded = useEffectEvent(() => {
    if (!attemptedRef.current) void create();
  });
  useEffect(() => {
    if (isUploaded) createOnceUploaded();
  }, [isUploaded]);

  // ダイアログを閉じたら、比較のためのファイルの読み込みを止める。
  useEffect(() => () => matchingControllerRef.current?.abort(), []);

  return {
    queue,
    entries,
    hasStarted: entries.length > 0 || matching !== null,
    matching,
    cancelMatching,
    isUploaded,
    /** アップロードがフォルダ全体に届かずに止まった。ダイアログが、送り直すか外すかを尋ねる。 */
    isWaitingForChoice,
    unfinishedCount: unfinishedItemIds.length,
    storedCount: storedArtifactIds.size,
    reusedCount: reusedEntries.length,
    reusedBytes: reusedEntries.reduce((total, entry) => total + entry.source.file.size, 0),
    resendUnfinished,
    createWithoutUnfinished,
    isCreating: creation.pending,
    creationError: creation.error,
    retryCreate: () => void create(),
    start: (
      sources: UploadSource[],
      fields: DatasetFolderVersionFields,
      continuation: DatasetFolderContinuation | null,
    ) => void start(sources, fields, continuation),
  };
}

/**
 * 同じパスとサイズの保存済みのファイルがある選んだファイルを1つずつハッシュし、バイト列が同じ
 * ものについて保存済みのArtifactを返す。読めないファイルは、そのままアップロードし直す。
 */
async function findStoredCopies({
  pairs,
  signal,
  onProgress,
}: {
  pairs: Array<{ entry: DatasetFolderEntry; stored: StoredFolderFile }>;
  signal: AbortSignal;
  onProgress: (matching: DatasetFolderMatching) => void;
}): Promise<Map<DatasetFolderEntry, string>> {
  const reused = new Map<DatasetFolderEntry, string>();
  onProgress({ checked: 0, total: pairs.length });
  for (const [index, { entry, stored }] of pairs.entries()) {
    // Web Cryptoはsignalを使わずにファイル全体を読むので、止めたかどうかはファイルの間で確かめる。
    if (signal.aborted) break;
    try {
      if ((await sha256OfFile(entry.source.file, signal)) === stored.sha256) reused.set(entry, stored.id);
    } catch {
      if (signal.aborted) break;
    }
    onProgress({ checked: index + 1, total: pairs.length });
  }
  return reused;
}
