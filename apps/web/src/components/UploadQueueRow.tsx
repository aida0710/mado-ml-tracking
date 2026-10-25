import { Pause, Play, X } from 'lucide-react';
import type { UploadItem } from '../hooks/useArtifactUploadQueue';
import { CopyButton } from './CopyButton';
import { formatBytes } from '../lib/format';
import { formatRemainingTime } from '../lib/remainingTime';
import { formatUploadFailure } from '../lib/uploadFailure';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { uploadStatusLabels } from '../i18n/uploads';

/**
 * アップロードキューの1ファイル。進み具合、転送速度か再試行の状態、エラー、操作を出す。`name`は
 * 利用者がファイルを見分ける名前。`showArtifactReference`は、ほかの場所へ貼るための保存した
 * ArtifactのIDを足す。これが要るのは1ファイルだけをアップロードしたときだけ。
 */
export function UploadQueueRow({
  item,
  name,
  showArtifactReference,
  onPause,
  onResume,
  onCancel,
}: {
  item: UploadItem;
  name: string;
  showArtifactReference: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  useLocale();
  const canPause = item.method === 'multipart' && ['queued', 'preparing', 'uploading'].includes(item.status);
  const canResume = item.status === 'paused' || item.status === 'failed';
  const canCancel = !['verifying', 'completed', 'canceled'].includes(item.status);
  const percent = item.size === 0 ? (item.status === 'completed' ? 100 : 0) : (item.sentBytes / item.size) * 100;
  return (
    <li className={`upload-queue-row ${item.status}`} data-testid="upload-queue-row" data-status={item.status}>
      <div className="upload-queue-title">
        <span className="mono" title={item.path}>{name}</span>
        <span className={`upload-status ${item.status}`}>{uploadStatusLabels[item.status]}</span>
      </div>
      <progress max={100} value={percent} aria-label={name} />
      <div className="upload-queue-meta muted">
        <span>{formatBytes(item.sentBytes)} / {formatBytes(item.size)}</span>
        {item.bytesPerSecond !== null && (
          <span>{textTemplates.uploadTransferRate(formatBytes(item.bytesPerSecond))}</span>
        )}
        {item.remainingSeconds !== null && (
          <span>{textTemplates.uploadRemainingTime(formatRemainingTime(item.remainingSeconds))}</span>
        )}
        {item.resumedBytes > 0 && item.status !== 'completed' && (
          <span>{textTemplates.uploadResumedBytes(formatBytes(item.resumedBytes))}</span>
        )}
      </div>
      {item.retry && (
        <p className="upload-queue-retry" role="status" data-testid="upload-queue-retry">
          {textTemplates.uploadRetrying(item.retry.attempt, item.retry.maxAttempts)}
        </p>
      )}
      {item.error && <p className="upload-queue-error" role="alert">{formatUploadFailure(item.error)}</p>}
      {showArtifactReference && item.artifact && (
        <div className="upload-queue-artifact">
          <span className="mono">artifact://{item.artifact.id}</span>
          <CopyButton value={item.artifact.id} />
        </div>
      )}
      <div className="upload-queue-actions">
        {canPause && (
          <button type="button" className="button small" onClick={() => onPause(item.id)}>
            <Pause size={14} />
            {text.uploadPause}
          </button>
        )}
        {canResume && (
          <button type="button" className="button small" onClick={() => onResume(item.id)}>
            <Play size={14} />
            {text.uploadResume}
          </button>
        )}
        {canCancel && (
          <button type="button" className="button small" onClick={() => onCancel(item.id)}>
            <X size={14} />
            {text.uploadCancel}
          </button>
        )}
      </div>
    </li>
  );
}
