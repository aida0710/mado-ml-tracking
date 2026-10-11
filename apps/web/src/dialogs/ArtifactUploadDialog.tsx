import { useState, type DragEvent } from 'react';
import type { Artifact } from '@mmt/contracts';
import { Upload } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { FolderPickerButton } from '../components/FolderPickerButton';
import { ResumableUploadList } from '../components/ResumableUploadList';
import { UploadQueuePanel } from '../components/UploadQueuePanel';
import { useArtifactUploadQueue } from '../hooks/useArtifactUploadQueue';
import { useUploadResume, type SelectedFileResume } from '../hooks/useUploadResume';
import { useArtifactAtPath, type ArtifactAtPath } from '../hooks/useArtifactAtPath';
import { sourcesFromDataTransfer, sourcesFromFileList, type UploadSource } from '../lib/droppedFiles';
import { formatBytes, formatDate } from '../lib/format';
import { joinArtifactPath } from '../lib/uploadPlan';
import { text, textTemplates } from '../i18n/catalog';

// Saved paths listed before the start, so a folder's layout can be checked without reading all.
const PLANNED_PATH_EXAMPLE_COUNT = 3;

/**
 * Uploads Artifacts with progress, pause, cancel, and resume. `multiple` adds several files,
 * folders, and a destination folder; without it the dialog takes one file and closes on its
 * Artifact, as the code version form expects. `initialFolder` is the folder open behind the
 * dialog, where new files go unless the path is changed.
 */
export function ArtifactUploadDialog({
  projectId,
  runId,
  onClose,
  onSaved,
  accept,
  multiple = false,
  initialFolder = '',
}: {
  projectId: string;
  runId: string | null;
  onClose: () => void;
  /** Called once per completed Artifact. */
  onSaved: (artifact: Artifact) => void;
  accept?: string;
  multiple?: boolean;
  initialFolder?: string;
}) {
  const [sources, setSources] = useState<UploadSource[]>([]);
  const [destination, setDestination] = useState(initialFolder);
  const [singlePath, setSinglePath] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const queue = useArtifactUploadQueue({ projectId, runId, onCompleted: onSaved });
  const resume = useUploadResume({
    projectId,
    runId,
    sessions: queue.resumableSessions,
    selectedFile: sources.length === 1 ? sources[0]!.file : null,
    onMatched: (match) => setSinglePath(match.path),
    enqueue: queue.enqueue,
    discardSession: queue.discardSession,
  });
  const singleArtifactPath = joinArtifactPath('', singlePath);
  const { selectedFileResume } = resume;
  const resumeMatch = selectedFileResume.status === 'matched' ? selectedFileResume.match : null;
  const artifactAtPath = useArtifactAtPath({
    projectId,
    runId,
    path: singleArtifactPath,
    file: sources.length === 1 && !resumeMatch ? sources[0]!.file : null,
  });
  const plannedPaths = sources.map((source) => joinArtifactPath(destination, source.relativePath));

  function select(selected: UploadSource[]) {
    const accepted = multiple ? selected : selected.slice(0, 1);
    setSources(accepted);
    const first = accepted[0];
    setSinglePath(first ? joinArtifactPath(initialFolder, first.relativePath) : '');
  }
  async function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    select(await sourcesFromDataTransfer(event.dataTransfer));
  }
  function start() {
    const isSingle = sources.length === 1;
    queue.enqueue(
      sources.map((source) => ({
        source,
        path: isSingle ? singleArtifactPath : joinArtifactPath(destination, source.relativePath),
        ...(isSingle && resumeMatch?.path === singleArtifactPath ? { verifiedUploadId: resumeMatch.uploadId } : {}),
      })),
    );
    setSources([]);
  }
  const totalSize = sources.reduce((total, source) => total + source.file.size, 0);
  // Starting while the comparison runs would miss the path it is about to fill in.
  const canStart =
    sources.length > 0 &&
    selectedFileResume.status !== 'checking' &&
    (sources.length > 1 || singleArtifactPath !== '');
  return (
    <Dialog title={text.uploadArtifact} onClose={onClose} busy={queue.isActive} wide>
      <form
        className="artifact-upload-form touch-targets"
        onSubmit={(event) => {
          event.preventDefault();
          if (canStart) start();
        }}
      >
        <div
          className={isDragging ? 'upload-dropzone dragging' : 'upload-dropzone'}
          data-testid="upload-dropzone"
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => void drop(event)}
        >
          <p className="muted">{text.uploadDropHint}</p>
          <div className="upload-pickers">
            <label className="button">
              <Upload size={15} />
              {text.uploadChooseFiles}
              <input
                type="file"
                className="sr-only"
                accept={accept}
                multiple={multiple}
                onChange={(event) => {
                  select(sourcesFromFileList(event.target.files));
                  event.target.value = '';
                }}
              />
            </label>
            {multiple && <FolderPickerButton label={text.uploadChooseFolder} onChoose={select} />}
          </div>
        </div>
        {sources.length === 1 && (
          <div className="upload-path-field">
            <label className="field">
              <span>{text.artifactPath}</span>
              <input required value={singlePath} onChange={(event) => setSinglePath(event.target.value)} />
            </label>
            <SelectedFileResumeNotice
              resume={selectedFileResume}
              path={singleArtifactPath}
              onRestorePath={(path) => setSinglePath(path)}
            />
            {artifactAtPath && <ArtifactAtPathNotice found={artifactAtPath} />}
          </div>
        )}
        {sources.length > 1 && (
          <>
            <p className="upload-selection">
              {text.uploadSelectedFiles}: {textTemplates.uploadSelectedCount(sources.length, formatBytes(totalSize))}
            </p>
            <label className="field">
              <span>{text.uploadDestination}</span>
              <input value={destination} onChange={(event) => setDestination(event.target.value)} />
              <small className="muted">{text.uploadDestinationHint}</small>
            </label>
            <p className="muted upload-planned-paths" data-testid="upload-planned-paths">
              {textTemplates.uploadPlannedPaths(
                plannedPaths.slice(0, PLANNED_PATH_EXAMPLE_COUNT),
                Math.max(0, plannedPaths.length - PLANNED_PATH_EXAMPLE_COUNT),
              )}
            </p>
          </>
        )}
        <ResumableUploadList
          sessions={queue.resumableSessions}
          onContinue={resume.continueSession}
          onStartOver={resume.startOver}
          onDiscard={queue.discardSession}
        />
        <ErrorNotice message={queue.resumableSessionsError} />
        <UploadQueuePanel
          items={queue.items}
          onPause={queue.pause}
          onResume={queue.resume}
          onCancel={(id) => void queue.cancel(id)}
          onRetryFailed={queue.retryFailed}
        />
        {queue.isActive && <p className="muted">{text.uploadInProgressNotice}</p>}
        <footer>
          <button type="button" className="button" disabled={queue.isActive} onClick={onClose}>
            {text.close}
          </button>
          {sources.length > 0 && (
            <button type="button" className="button" onClick={() => select([])}>
              {text.uploadClearSelection}
            </button>
          )}
          <button className="button primary" disabled={!canStart}>
            {text.uploadStart}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

/** Under the path field: whether the chosen file continues an unfinished upload. */
function SelectedFileResumeNotice({
  resume,
  path,
  onRestorePath,
}: {
  resume: SelectedFileResume;
  path: string;
  onRestorePath: (path: string) => void;
}) {
  if (resume.status === 'checking')
    return <p className="muted upload-resume-notice" role="status">{text.uploadResumeChecking}</p>;
  if (resume.status !== 'matched') return null;
  const { match } = resume;
  if (path === match.path)
    return (
      <p className="notice upload-resume-notice" data-testid="upload-resume-matched">
        {textTemplates.uploadResumeMatched(formatBytes(match.receivedBytes), formatBytes(match.expectedSize))}
      </p>
    );
  return (
    <div className="notice upload-resume-notice" data-testid="upload-resume-path-changed">
      <span>{text.uploadResumePathChanged}</span>
      <button type="button" className="button small" onClick={() => onRestorePath(match.path)}>
        {text.uploadRestoreResumePath}
      </button>
    </div>
  );
}

/** Under the path field: a file is already stored there, so this upload becomes its new version. */
function ArtifactAtPathNotice({ found }: { found: ArtifactAtPath }) {
  return (
    <p className="notice upload-resume-notice" data-testid="upload-path-exists">
      {textTemplates.uploadPathExists(formatDate(found.existing.createdAt))}
      {found.isSameContent && ` ${text.uploadPathSameContent}`}
    </p>
  );
}
