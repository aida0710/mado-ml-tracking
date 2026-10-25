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
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';
import { resumeBlockerNextSteps, resumeBlockerReasons } from '../i18n/uploads';
import { joinSentences } from '../i18n/textJoining';

/**
 * このRunの終わっていないアップロードと、それぞれを続ける手段。ファイルを選び直すと、足りない部分
 * だけをセッションのパスへ送るので、パスを入力し直す必要は無い。
 */
export function ResumableUploadList({
  sessions,
  onContinue,
  onStartOver,
  onDiscard,
}: {
  sessions: ArtifactUploadListItem[];
  /** ファイルでセッションを続けられない理由、またはキューに入ったらnullで解決する。 */
  onContinue: (session: ArtifactUploadListItem, source: UploadSource) => Promise<ResumeBlocker | null>;
  onStartOver: (session: ArtifactUploadListItem, source: UploadSource) => void;
  onDiscard: (uploadId: string) => Promise<void>;
}) {
  useLocale();
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
  useLocale();
  // 検査で断られたファイル。［最初から送る］でもう一度選ばずに済むよう取っておく。
  const [refused, setRefused] = useState<{ blocker: ResumeBlocker; source: UploadSource } | null>(null);
  const check = useMutation();
  const discard = useMutation();
  const originalFile = useMemo(() => findResumeRecordByUploadId(session.id), [session.id]);
  // 行が出たときに判定する。いずれにせよ、期限切れのセッションはサーバーが断る。
  const [shownAt] = useState(() => Date.now());
  const isExpired = blockerFromSession(session, shownAt) === 'expired';
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
        // 選択が断られたときは読み上げで知らせる。期限切れの行は最初から静かにそう表示する。
        <p className="upload-queue-error" role={refused ? 'alert' : undefined}>
          {joinSentences([resumeBlockerReasons[blocker], resumeBlockerNextSteps[blocker]])}
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
          // Editorの権限が無ければ、破棄も同じく断られる。
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
  get continue() { return text.uploadContinue; },
  get chooseAgain() { return text.uploadChooseAgain; },
  get startOver() { return text.uploadStartOver; },
};
const PICKER_ICONS: Record<RowPicker, ReactNode> = {
  continue: <Play size={14} />,
  chooseAgain: <FileSearch size={14} />,
  startOver: <RotateCcw size={14} />,
};

/** 行でファイルを選ぶと何が起きるか。ファイルを選んでも役に立たないときはnull。 */
function choosePicker({ blocker, hasRefusedFile }: { blocker: ResumeBlocker | null; hasRefusedFile: boolean }): RowPicker | null {
  if (!blocker) return 'continue';
  if (canChooseAnotherFileAfter(blocker)) return 'chooseAgain';
  // ファイルを選ぶ前から期限切れと分かっていれば、選んだ時点で最初からやり直す。
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
  useLocale();
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
