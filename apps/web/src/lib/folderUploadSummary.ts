// The whole of a folder upload at a glance: one bar for every file, and the files that need a look.
import type { DatasetFolderEntry } from './datasetFolder';
import { estimateRemainingSeconds } from './uploadPlan';

/** The part of an upload queue row the summary reads. */
export interface FolderUploadItemState {
  id: string;
  path: string;
  status: string;
  size: number;
  sentBytes: number;
  bytesPerSecond: number | null;
}

// Rows a person may need to act on or watch; queued and completed ones are only counted.
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
    /** The file's path inside the dataset, which is how the person knows it. */
    nameOf: (item: Item) => datasetPathByArtifactPath.get(item.path) ?? item.path,
  };
}
