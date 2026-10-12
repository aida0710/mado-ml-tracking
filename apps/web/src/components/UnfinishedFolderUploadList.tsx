import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { FolderPickerButton } from './FolderPickerButton';
import type { UnfinishedFolderUpload } from '../lib/datasetFolderResume';
import type { UploadSource } from '../lib/droppedFiles';
import { formatBytes, formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * Folder uploads of this dataset that stopped before their version. Each row continues with the
 * folder chosen again (stored files are not sent twice) or discards what the attempt left.
 * Render it outside the dialog's form: the discard confirmation is a dialog with its own form.
 */
export function UnfinishedFolderUploadList({
  uploads,
  canDeleteStoredFiles,
  disabled,
  onContinue,
  onDiscard,
}: {
  uploads: UnfinishedFolderUpload[];
  /** Project admins may delete stored files; anyone may discard their own open uploads. */
  canDeleteStoredFiles: boolean;
  disabled: boolean;
  onContinue: (upload: UnfinishedFolderUpload, sources: UploadSource[]) => void;
  onDiscard: (upload: UnfinishedFolderUpload) => Promise<void>;
}) {
  useLocale();
  const [discarding, setDiscarding] = useState<UnfinishedFolderUpload | null>(null);
  if (uploads.length === 0) return null;
  return (
    <section className="upload-resumable unfinished-folder-uploads" aria-label={text.datasetFolderUnfinishedUploads}>
      <h3>{text.datasetFolderUnfinishedUploads}</h3>
      <p className="muted">{text.datasetFolderUnfinishedHint}</p>
      <ul>
        {uploads.map((upload) => {
          const canDiscard = canDeleteStoredFiles || upload.storedFileCount === 0;
          return (
            <li key={upload.folder} className="upload-resumable-row" data-testid="unfinished-folder-upload">
              <div className="upload-queue-title">
                <span>{textTemplates.datasetFolderStartedAt(formatDate(upload.startedAt))}</span>
              </div>
              <div className="upload-queue-meta muted">
                {upload.storedFileCount > 0 && (
                  <span>{textTemplates.datasetFolderStoredFiles(upload.storedFileCount, formatBytes(upload.storedBytes))}</span>
                )}
                {upload.openUploads.length > 0 && (
                  <span>
                    {textTemplates.datasetFolderOpenUploads(
                      upload.openUploads.length,
                      formatBytes(upload.openUploads.reduce((total, session) => total + session.receivedBytes, 0)),
                    )}
                  </span>
                )}
                {upload.lastStoredAt && (
                  <span>{textTemplates.datasetFolderLastStored(formatDate(upload.lastStoredAt))}</span>
                )}
              </div>
              {!canDiscard && <p className="muted">{text.datasetFolderDiscardNeedsAdmin}</p>}
              <div className="upload-queue-actions">
                <FolderPickerButton
                  label={text.uploadContinue}
                  size="small"
                  disabled={disabled}
                  onChoose={(sources) => onContinue(upload, sources)}
                />
                {canDiscard && (
                  <button
                    type="button"
                    className="button small"
                    disabled={disabled}
                    onClick={() => setDiscarding(upload)}
                  >
                    <Trash2 size={14} />
                    {text.uploadDiscardSession}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {discarding && (
        <ConfirmDialog
          title={text.datasetFolderDiscardTitle}
          message={textTemplates.datasetFolderDiscardMessage({
            startedAt: formatDate(discarding.startedAt),
            storedFiles: canDeleteStoredFiles ? discarding.storedFileCount : 0,
            storedSize: formatBytes(discarding.storedBytes),
            openUploads: discarding.openUploads.length,
          })}
          confirmLabel={text.uploadDiscardSession}
          destructive
          onConfirm={() => onDiscard(discarding)}
          onConfirmed={() => setDiscarding(null)}
          onClose={() => setDiscarding(null)}
        />
      )}
    </section>
  );
}
