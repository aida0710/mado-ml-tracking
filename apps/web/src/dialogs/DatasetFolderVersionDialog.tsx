import { useState, type DragEvent } from 'react';
import type { Dataset, DatasetVersion } from '@mmt/contracts';
import { useProject } from '../hooks/useProject';
import { useDatasetFolderUploads } from '../hooks/useDatasetFolderUploads';
import { useDatasetFolderVersion } from '../hooks/useDatasetFolderVersion';
import { useFolderContinuation, type FolderContinuation } from '../hooks/useFolderContinuation';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { FolderPickerButton } from '../components/FolderPickerButton';
import { FormFields } from '../components/FormFields';
import { FolderUploadKeptFilesNotice } from '../components/FolderUploadKeptFilesNotice';
import { FolderUploadProgress } from '../components/FolderUploadProgress';
import { UnfinishedFolderUploadList } from '../components/UnfinishedFolderUploadList';
import { formatErrorMessage } from '../lib/errorMessage';
import { sourcesFromDataTransfer, type UploadSource } from '../lib/droppedFiles';
import { formatBytes, formatDate } from '../lib/format';
import {
  createInitialValues,
  getFieldValue,
  getOptionalValue,
  getSelectedValues,
  parseJsonObject,
} from '../lib/formValues';
import type { FormField, SelectOption } from '../types/form';
import { text, textTemplates } from '../i18n/catalog';

/**
 * Uploads a folder and creates a version of its files. A folder upload that stopped earlier is
 * listed first; choosing the same folder again continues it, so its stored files are not sent
 * twice and its half-sent files continue from the parts the server holds.
 */
export function DatasetFolderVersionDialog({
  title,
  dataset,
  parentOptions,
  defaultParentIds,
  onClose,
  onSaved,
}: {
  title: string;
  dataset: Dataset;
  parentOptions: SelectOption[];
  defaultParentIds: string[];
  onClose: () => void;
  onSaved: (version: DatasetVersion) => void;
}) {
  const { project, isProjectAdmin } = useProject();
  const fields: FormField[] = [
    { name: 'version', label: text.datasetVersionOptional },
    {
      name: 'parents',
      label: text.parents,
      type: 'checkboxes',
      options: parentOptions,
      defaultValue: defaultParentIds,
      hint: text.datasetParentsHint,
      emptyText: text.datasetParentsEmpty,
    },
    { name: 'metadata', label: text.metadata, type: 'textarea', defaultValue: '{}' },
  ];
  const [values, setValues] = useState(() => createInitialValues(fields));
  const [sources, setSources] = useState<UploadSource[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const folder = useDatasetFolderVersion({ projectId: project.id, dataset, onCreated: onSaved });
  const { queue } = folder;
  const unfinished = useDatasetFolderUploads({
    projectId: project.id,
    datasetId: dataset.id,
    openUploads: queue.resumableSessions,
    discardOpenUpload: queue.discardSession,
    canDeleteStoredFiles: isProjectAdmin,
  });
  const continuation = useFolderContinuation({
    datasetId: dataset.id,
    sources,
    uploads: unfinished.uploads,
    loadStoredFiles: unfinished.loadStoredFiles,
  });
  const busy = queue.isActive || folder.isCreating || folder.matching !== null;
  const canStart = sources.length > 0 && !folder.hasStarted && !continuation.isChecking;

  function start() {
    let metadata;
    try {
      metadata = parseJsonObject(getFieldValue(values, 'metadata'));
    } catch (failure) {
      setFormError(formatErrorMessage(failure));
      return;
    }
    setFormError(null);
    const continued = continuation.continuation;
    folder.start(
      sources,
      {
        version: getOptionalValue(values, 'version'),
        metadata,
        parentDatasetVersionIds: getSelectedValues(values, 'parents'),
      },
      continued ? { folder: continued.upload.folder, storedFiles: continued.storedFiles } : null,
    );
  }
  async function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    setSources(await sourcesFromDataTransfer(event.dataTransfer));
  }
  const totalSize = sources.reduce((total, chosen) => total + chosen.file.size, 0);
  return (
    <Dialog title={title} onClose={onClose} busy={busy} wide>
      {unfinished.discardWithKeptFiles && (
        <FolderUploadKeptFilesNotice
          projectId={project.id}
          datasetId={dataset.id}
          discard={unfinished.discardWithKeptFiles}
        />
      )}
      {!folder.hasStarted && (
        <UnfinishedFolderUploadList
          uploads={unfinished.uploads}
          canDeleteStoredFiles={isProjectAdmin}
          disabled={busy}
          onContinue={(upload, chosen) => {
            setSources(chosen);
            continuation.continueUpload(upload, chosen);
          }}
          onDiscard={unfinished.discard}
        />
      )}
      <ErrorNotice message={unfinished.error} retry={unfinished.reload} />
      <form
        className="artifact-upload-form touch-targets"
        onSubmit={(event) => {
          event.preventDefault();
          if (canStart) start();
        }}
      >
        <fieldset disabled={folder.hasStarted}>
          <FormFields fields={fields} values={values} onChange={setValues} />
          <div
            className={isDragging ? 'upload-dropzone dragging' : 'upload-dropzone'}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => void drop(event)}
          >
            <p className="muted">{text.datasetFolderHint}</p>
            <div className="upload-pickers">
              <FolderPickerButton label={text.datasetFolderChoose} onChoose={setSources} />
            </div>
          </div>
          {sources.length > 0 && (
            <p className="upload-selection">
              {textTemplates.datasetFolderSelected(sources.length, formatBytes(totalSize))}
            </p>
          )}
        </fieldset>
        {!folder.hasStarted && sources.length > 0 && (
          <ContinuationNotice
            isChecking={continuation.isChecking}
            continuation={continuation.continuation}
            onStartNew={continuation.startNew}
          />
        )}
        <ErrorNotice message={formError ?? continuation.error} />
        {folder.matching && (
          <div className="notice upload-resume-notice" data-testid="folder-upload-matching">
            <span role="status">
              {textTemplates.datasetFolderMatching(folder.matching.checked, folder.matching.total)}
            </span>
            <button type="button" className="button small" onClick={folder.cancelMatching}>
              {text.datasetFolderStopMatching}
            </button>
          </div>
        )}
        <FolderUploadProgress
          entries={folder.entries}
          items={queue.items}
          onPause={queue.pause}
          onResume={queue.resume}
          onCancel={(id) => void queue.cancel(id)}
          onRetryFailed={queue.retryFailed}
        />
        {queue.isActive && <p className="muted">{text.uploadInProgressNotice}</p>}
        {folder.isWaitingForChoice && (
          <div className="notice dataset-folder-choice" role="status">
            <p>{textTemplates.datasetFolderUnfinished(folder.unfinishedCount, folder.storedCount)}</p>
            <div className="upload-pickers">
              <button type="button" className="button small" onClick={folder.resendUnfinished}>
                {text.datasetFolderResendUnfinished}
              </button>
              <button
                type="button"
                className="button small primary"
                disabled={folder.storedCount === 0}
                onClick={folder.createWithoutUnfinished}
              >
                {text.datasetFolderCreateWithoutUnfinished}
              </button>
            </div>
          </div>
        )}
        {folder.isCreating && <p className="muted">{text.datasetFolderCreating}</p>}
        <ErrorNotice message={folder.creationError} />
        <footer>
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            {text.close}
          </button>
          {folder.isUploaded && folder.creationError && (
            <button type="button" className="button primary" disabled={busy} onClick={folder.retryCreate}>
              {text.datasetFolderRetryCreate}
            </button>
          )}
          {!folder.hasStarted && (
            <button className="button primary" disabled={!canStart}>
              {continuation.continuation ? text.datasetFolderContinueAndCreate : text.datasetFolderUploadAndCreate}
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}

/** Under the chosen folder: whether it continues a stopped attempt, and the way out of that. */
function ContinuationNotice({
  isChecking,
  continuation,
  onStartNew,
}: {
  isChecking: boolean;
  continuation: FolderContinuation | null;
  onStartNew: () => void;
}) {
  if (isChecking)
    return (
      <p className="muted upload-resume-notice" role="status">
        {text.datasetFolderContinuationChecking}
      </p>
    );
  if (!continuation) return null;
  const startedAt = formatDate(continuation.upload.startedAt);
  return (
    <div className="notice upload-resume-notice" data-testid="folder-continuation-notice">
      <span>
        {continuation.matchedCount > 0
          ? textTemplates.datasetFolderContinues(startedAt, continuation.matchedCount)
          : textTemplates.datasetFolderContinuesWithoutMatch(startedAt)}
      </span>
      <button type="button" className="button small" onClick={onStartNew}>
        {text.datasetFolderStartNew}
      </button>
    </div>
  );
}
