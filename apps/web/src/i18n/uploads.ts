// Artifact upload dialog and queue: progress, pause, cancel, resume. web-resumable-upload-manager owns the entries.
import type { UploadItemStatus } from '../hooks/useArtifactUploadQueue';
import type { ResumeBlocker } from '../lib/uploadResumeBlocker';

export const uploadsText = {
  uploadChooseFiles: 'ファイルを選ぶ',
  uploadChooseFolder: 'フォルダを選ぶ',
  uploadDropHint: 'ここにファイルやフォルダをドロップできます',
  uploadDestination: '保存先フォルダ',
  uploadDestinationHint: 'フォルダを選んだときは、フォルダ内の構成を保ったままこの下に置きます。',
  uploadSelectedFiles: '選んだファイル',
  uploadClearSelection: '選び直す',
  uploadStart: 'アップロードを開始',
  uploadQueue: 'アップロードの進み具合',
  uploadPause: '一時停止',
  uploadResume: '再開',
  uploadCancel: '取消',
  uploadRetryFailed: '失敗したファイルを再送',
  uploadVerificationFailed: 'サーバーでの検証に失敗しました',
  uploadCancelNotSent: '取消をサーバーへ送れませんでした。受信済みの部分は期限（7日）で消えます',
  uploadResumableSessions: '途中のアップロード',
  uploadResumableHint: '同じファイルを選ぶと、送信済みの部分を除いて続きから送ります。',
  uploadDiscardSession: '破棄',
  uploadExpires: '期限',
  uploadContinue: '続きを送る',
  uploadStartOver: '最初から送る',
  uploadChooseAgain: 'ファイルを選び直す',
  uploadOriginalFile: '元のファイル',
  uploadSessionExpired: '期限切れ',
  uploadResumeChecking: '途中のアップロードと同じファイルか確かめています…',
  uploadResumePathChanged: '保存パスを変えたので、新しいアップロードとして最初から送ります。',
  uploadRestoreResumePath: '保存パスを戻す',
  uploadRestartFromQueue: '［再開］を押すと、最初から送り直します。',
  uploadInProgressNotice: 'アップロード中は閉じられません。一時停止か取消をしてから閉じてください。',
} as const;

export const uploadStatusLabels: Record<UploadItemStatus, string> = {
  queued: '待機中',
  preparing: '準備中',
  uploading: '送信中',
  verifying: 'サーバーで検証中',
  paused: '一時停止',
  failed: '失敗',
  canceled: '取消済み',
  completed: '完了',
};

/** What stopped an unfinished upload from continuing. */
export const resumeBlockerReasons: Record<ResumeBlocker, string> = {
  expired: '期限（7日）が切れたため、送信済みの部分は使えません。',
  gone: 'このアップロードはサーバーに残っていません（破棄されたか、期限切れで消えました）。',
  permissionLost: 'このプロジェクトにArtifactを追加する権限がなくなりました。',
  otherCredential: 'このアップロードは、別のユーザーか別の認証情報（API tokenなど）で始めたものです。',
  runDeleted: 'このRunは削除されたため、Artifactを追加できません。',
  sizeDiffers: '選んだファイルは、途中のアップロードとサイズが違います。',
  contentDiffers: '選んだファイルは、送信済みの部分と中身が一致しません。別のファイルのようです。',
};

/** What the person can do next, next to the buttons of the unfinished upload's row. */
export const resumeBlockerNextSteps: Record<ResumeBlocker, string> = {
  expired: '［最初から送る］で、同じ保存パスへ送り直せます。',
  gone: '［最初から送る］で、同じ保存パスへ送り直せます。',
  permissionLost: 'プロジェクトの管理者に Editor 以上の権限を頼んでください。期限までに権限が戻れば、続きから送れます。',
  otherCredential: '始めたときと同じ方法で続きを送るか、［最初から送る］で送り直してください。',
  runDeleted: '別のRunへ送ってください。',
  sizeDiffers: '同じファイルを選び直してください。',
  contentDiffers: '同じファイルを選び直してください。このファイルを新しく送るときは、上の［ファイルを選ぶ］から選んでください。',
};

// Text that embeds values; merged into catalog's textTemplates.
export const uploadsTextTemplates = {
  uploadSelectedCount: (count: number, totalSize: string) => `${count}件（${totalSize}）`,
  uploadTransferRate: (rate: string) => `${rate}/秒`,
  uploadRemainingTime: (duration: string) => `残り ${duration}`,
  uploadResumedBytes: (size: string) => `前回の続きから（${size} は送信済み）`,
  uploadProgressSummary: (done: number, total: number) => `${done} / ${total} 件完了`,
  uploadSessionReceived: (sent: string, total: string) => `${sent} / ${total} 送信済み`,
  uploadResumeMatched: (sent: string, total: string) =>
    `前回の続きから送ります（${sent} / ${total} 送信済み）。保存パスは前回と同じものに合わせました。`,
};
