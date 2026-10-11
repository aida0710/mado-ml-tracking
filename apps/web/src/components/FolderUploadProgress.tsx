import { RotateCcw } from 'lucide-react';
import type { UploadItem } from '../hooks/useArtifactUploadQueue';
import type { DatasetFolderEntry } from '../lib/datasetFolder';
import { summarizeFolderUpload } from '../lib/folderUploadSummary';
import { formatBytes } from '../lib/format';
import { formatRemainingTime } from '../lib/remainingTime';
import { UploadQueueRow } from './UploadQueueRow';
import { text, textTemplates } from '../i18n/catalog';

/**
 * A folder upload as one bar for the whole folder, then only the files to watch or act on
 * (sending, paused, failed). Waiting and finished files are counted, not listed, so a failure
 * is not lost among hundreds of rows.
 */
export function FolderUploadProgress({
  entries,
  items,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
}: {
  entries: DatasetFolderEntry[];
  items: UploadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetryFailed: () => void;
}) {
  if (entries.length === 0) return null;
  const summary = summarizeFolderUpload(entries, items);
  return (
    <section className="upload-queue folder-upload-progress" aria-label={text.uploadQueue} data-testid="folder-upload-progress">
      <header>
        <h3>{text.uploadQueue}</h3>
        <span className="muted">{textTemplates.uploadProgressSummary(summary.doneFiles, summary.totalFiles)}</span>
        {summary.hasFailed && (
          <button type="button" className="button small" onClick={onRetryFailed}>
            <RotateCcw size={14} />
            {text.uploadRetryFailed}
          </button>
        )}
      </header>
      <div className="folder-upload-overall">
        <progress
          max={Math.max(summary.totalBytes, 1)}
          value={summary.sentBytes}
          aria-label={text.datasetFolderOverallProgress}
        />
        <div className="upload-queue-meta muted">
          <span>
            {formatBytes(summary.sentBytes)} / {formatBytes(summary.totalBytes)}
          </span>
          {summary.bytesPerSecond !== null && (
            <span>{textTemplates.uploadTransferRate(formatBytes(summary.bytesPerSecond))}</span>
          )}
          {summary.remainingSeconds !== null && (
            <span>{textTemplates.uploadRemainingTime(formatRemainingTime(summary.remainingSeconds))}</span>
          )}
          {summary.reusedFiles > 0 && (
            <span data-testid="folder-upload-reused">{textTemplates.datasetFolderReused(summary.reusedFiles)}</span>
          )}
          {summary.queuedFiles > 0 && <span>{textTemplates.datasetFolderQueued(summary.queuedFiles)}</span>}
        </div>
      </div>
      {summary.shownItems.length > 0 && (
        <ul>
          {summary.shownItems.map((item) => (
            <UploadQueueRow
              key={item.id}
              item={item}
              name={summary.nameOf(item)}
              showArtifactReference={false}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
