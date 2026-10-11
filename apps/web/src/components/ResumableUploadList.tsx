import { useMemo, useState, type ReactNode } from 'react';
import type { ArtifactUploadListItem } from '@mmt/contracts';
import { FileSearch, Play, RotateCcw, Trash2 } from 'lucide-react';
import { ErrorNotice } from './Feedback';
import { useMutation } from '../hooks/useMutation';
import { sourcesFromFileList, type UploadSource } from '../lib/droppedFiles';
import { formatBytes, formatDate } from '../lib/format';
import {
  blockerFromSession,
  canChooseAnotherFileAfter,
  isSessionUnusable,
  type ResumeBlocker,
} from '../lib/uploadResumeBlocker';
import { findResumeRecordByUploadId } from '../lib/uploadResumeStore';
import { text, textTemplates } from '../i18n/catalog';
import { resumeBlockerNextSteps, resumeBlockerReasons } from '../i18n/uploads';

/**
 * Unfinished uploads of this Run, each with a way to continue it: choosing the file again sends
 * only the missing parts to the session's path, so the path never has to be typed again.
 */
export function ResumableUploadList({
  sessions,
  onContinue,
  onStartOver,
  onDiscard,
}: {
  sessions: ArtifactUploadListItem[];
  /** Resolves to why the file cannot continue the session, or null once it is queued. */
  onContinue: (session: ArtifactUploadListItem, source: UploadSource) => Promise<ResumeBlocker | null>;
  onStartOver: (session: ArtifactUploadListItem, source: UploadSource) => void;
  onDiscard: (uploadId: string) => Promise<void>;
}) {
  if (sessions.length === 0) return null;
  return (
    <section className="upload-resumable" aria-label={text.uploadResumableSessions}>
      <h3>{text.uploadResumableSessions}</h3>
      <p className="muted">{text.uploadResumableHint}</p>
      <ul>
        {sessions.map((session) => (
          <ResumableUploadRow
            key={session.id}
            session={session}
            onContinue={onContinue}
            onStartOver={onStartOver}
            onDiscard={onDiscard}
          />
        ))}
      </ul>
    </section>
  );
}

function ResumableUploadRow({
  session,
  onContinue,
  onStartOver,
  onDiscard,
}: {
  session: ArtifactUploadListItem;
  onContinue: (session: ArtifactUploadListItem, source: UploadSource) => Promise<ResumeBlocker | null>;
  onStartOver: (session: ArtifactUploadListItem, source: UploadSource) => void;
  onDiscard: (uploadId: string) => Promise<void>;
}) {
  // The file the check refused, kept so [最初から送る] needs no second pick.
  const [refused, setRefused] = useState<{ blocker: ResumeBlocker; source: UploadSource } | null>(null);
  const check = useMutation();
  const discard = useMutation();
  const originalFile = useMemo(() => findResumeRecordByUploadId(session.id), [session.id]);
  const isExpired = blockerFromSession(session, Date.now()) === 'expired';
  const blocker = refused?.blocker ?? (isExpired ? 'expired' : null);
  const picker = choosePicker({ blocker, hasRefusedFile: refused !== null });

  async function choose(source: UploadSource) {
    setRefused(null);
    if (isExpired) {
      onStartOver(session, source);
      return;
    }
    const found = await check.run(() => onContinue(session, source));
    if (found) setRefused({ blocker: found, source });
  }

  return (
    <li className="upload-resumable-row" data-testid="upload-resumable-session" data-blocker={blocker ?? undefined}>
      <div className="upload-queue-title">
        <span className="mono" title={session.path}>{session.path}</span>
        {isExpired && <span className="upload-status failed">{text.uploadSessionExpired}</span>}
      </div>
      <progress max={session.expectedSize} value={session.receivedBytes} aria-label={session.path} />
      <div className="upload-queue-meta muted">
        <span>{textTemplates.uploadSessionReceived(formatBytes(session.receivedBytes), formatBytes(session.expectedSize))}</span>
        {originalFile && (
          <span>
            {text.uploadOriginalFile}: <span className="mono">{originalFile.name}</span>
          </span>
        )}
        <span>{text.uploadExpires}: {formatDate(session.expiresAt)}</span>
      </div>
      {blocker && (
        // Announced when a pick was refused; an expired row says it from the start, quietly.
        <p className="upload-queue-error" role={refused ? 'alert' : undefined}>
          {resumeBlockerReasons[blocker]}
          {resumeBlockerNextSteps[blocker]}
        </p>
      )}
      {check.pending && <p className="muted" role="status">{text.uploadResumeChecking}</p>}
      <ErrorNotice message={check.error ?? discard.error} />
      <div className="upload-queue-actions">
        {picker && (
          <FilePickerButton
            icon={PICKER_ICONS[picker]}
            label={PICKER_LABELS[picker]}
            disabled={check.pending}
            onPick={(source) => void choose(source)}
          />
        )}
        {refused && isSessionUnusable(refused.blocker) && (
          <button type="button" className="button small" onClick={() => onStartOver(session, refused.source)}>
            <RotateCcw size={14} />
            {text.uploadStartOver}
          </button>
        )}
        {blocker !== 'permissionLost' && (
          // Without editor access the discard would be refused as well.
          <button
            type="button"
            className="button small"
            disabled={discard.pending || check.pending}
            onClick={() => void discard.run(() => onDiscard(session.id))}
          >
            <Trash2 size={14} />
            {text.uploadDiscardSession}
          </button>
        )}
      </div>
    </li>
  );
}

type RowPicker = 'continue' | 'chooseAgain' | 'startOver';

const PICKER_LABELS: Record<RowPicker, string> = {
  continue: text.uploadContinue,
  chooseAgain: text.uploadChooseAgain,
  startOver: text.uploadStartOver,
};
const PICKER_ICONS: Record<RowPicker, ReactNode> = {
  continue: <Play size={14} />,
  chooseAgain: <FileSearch size={14} />,
  startOver: <RotateCcw size={14} />,
};

/** What picking a file in the row does, or null when picking a file cannot help. */
function choosePicker({ blocker, hasRefusedFile }: { blocker: ResumeBlocker | null; hasRefusedFile: boolean }): RowPicker | null {
  if (!blocker) return 'continue';
  if (canChooseAnotherFileAfter(blocker)) return 'chooseAgain';
  // Seen as expired before any file was picked: the pick itself starts over.
  if (blocker === 'expired' && !hasRefusedFile) return 'startOver';
  return null;
}

function FilePickerButton({
  icon,
  label,
  disabled,
  onPick,
}: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onPick: (source: UploadSource) => void;
}) {
  return (
    <label className="button small" aria-disabled={disabled}>
      {icon}
      {label}
      <input
        type="file"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const [source] = sourcesFromFileList(event.target.files);
          event.target.value = '';
          if (source) onPick(source);
        }}
      />
    </label>
  );
}
