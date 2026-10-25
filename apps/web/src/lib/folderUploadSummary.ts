// フォルダのアップロード全体をひと目で示す。全ファイルで1本のバーと、目を向けるべきファイル。
import type { DatasetFolderEntry } from './datasetFolder';
import { estimateRemainingSeconds } from './uploadPlan';

/** アップロードの待ち行列の行のうち、まとめが読む部分。 */
export interface FolderUploadItemState {
  id: string;
  path: string;
  status: string;
  size: number;
  sentBytes: number;
  bytesPerSecond: number | null;
}

// 利用者が対応するか見守る必要があるかもしれない行。待機中と完了した行は数えるだけ。
const SHOWN_STATUSES: ReadonlySet<string> = new Set([
  'preparing',
  'uploading',
  'verifying',
  'paused',
  'failed',
  'canceled',
]);

export function summarizeFolderUpload<Item extends FolderUploadItemState>(
  entries: readonly DatasetFolderEntry[],
  items: readonly Item[],
) {
  const reused = entries.filter((entry) => entry.storedArtifactId);
  const reusedBytes = reused.reduce((total, entry) => total + entry.source.file.size, 0);
  const totalBytes = entries.reduce((total, entry) => total + entry.source.file.size, 0);
  const sentBytes = reusedBytes + items.reduce((total, item) => total + item.sentBytes, 0);
  const rates = items.flatMap((item) => (item.bytesPerSecond === null ? [] : [item.bytesPerSecond]));
  const bytesPerSecond = rates.length ? rates.reduce((total, rate) => total + rate, 0) : null;
  const datasetPathByArtifactPath = new Map(entries.map((entry) => [entry.artifactPath, entry.datasetPath]));
  return {
    totalFiles: entries.length,
    doneFiles: reused.length + items.filter((item) => item.status === 'completed').length,
    reusedFiles: reused.length,
    queuedFiles: items.filter((item) => item.status === 'queued').length,
    hasFailed: items.some((item) => item.status === 'failed'),
    totalBytes,
    sentBytes,
    bytesPerSecond,
    remainingSeconds: estimateRemainingSeconds(totalBytes - sentBytes, bytesPerSecond),
    shownItems: items.filter((item) => SHOWN_STATUSES.has(item.status)),
    /** データセットの中でのファイルのpath。利用者にはこの名前で分かる。 */
    nameOf: (item: Item) => datasetPathByArtifactPath.get(item.path) ?? item.path,
  };
}
