import { RotateCcw } from 'lucide-react';
import type { UploadItem } from '../hooks/useArtifactUploadQueue';
import { UploadQueueRow } from './UploadQueueRow';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * Artifactのアップロードの全ファイルを、1ファイル1行で出す。ファイルが1つなら、ほかの場所へ
 * 貼れるように保存したArtifactのIDも出す。複数のときは、IDは各ファイルの詳細にある。
 */
export function UploadQueuePanel({
  items,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
}: {
  items: UploadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetryFailed: () => void;
}) {
  useLocale();
  if (items.length === 0) return null;
  const completedCount = items.filter((item) => item.status === 'completed').length;
  const hasFailed = items.some((item) => item.status === 'failed');
  return (
    <section className="upload-queue" aria-label={text.uploadQueue}>
      <header>
        <h3>{text.uploadQueue}</h3>
        <span className="muted">{textTemplates.uploadProgressSummary(completedCount, items.length)}</span>
        {hasFailed && (
          <button type="button" className="button small" onClick={onRetryFailed}>
            <RotateCcw size={14} />
            {text.uploadRetryFailed}
          </button>
        )}
      </header>
      <ul>
        {items.map((item) => (
          <UploadQueueRow
            key={item.id}
            item={item}
            name={item.path}
            showArtifactReference={items.length === 1}
            onPause={onPause}
            onResume={onResume}
            onCancel={onCancel}
          />
        ))}
      </ul>
    </section>
  );
}
