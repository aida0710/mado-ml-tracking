import * as english from './en/uploads';
import { localized } from './localized';
// Artifactのアップロードのダイアログと待ち行列（進み具合、一時停止、取り消し、再開）。
// 項目はweb-resumable-upload-managerが受け持つ。
import type { UploadItemStatus } from '../hooks/useArtifactUploadQueue';
import type { ResumeBlocker } from '../lib/uploadResumeBlocker';

export const uploadsText = localized({
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
  uploadNetworkLostResume: '通信が切れました。回線を確かめてから［再開］を押すと、続きから送ります。',
  uploadPathSameContent: '中身も同じなので、送らなくても構いません。',
  uploadNetworkLostResend: '通信が切れました。回線を確かめてから［再開］を押すと、送り直します。',
} as const, english.uploadsText);

export const uploadStatusLabels: Record<UploadItemStatus, string> = localized({
  queued: '待機中',
  preparing: '準備中',
  uploading: '送信中',
  verifying: 'サーバーで検証中',
  paused: '一時停止',
  failed: '失敗',
  canceled: '取消済み',
  completed: '完了',
}, english.uploadStatusLabels);

/** 途中のアップロードを続けられなくなった理由。 */
export const resumeBlockerReasons: Record<ResumeBlocker, string> = localized({
  expired: '期限（7日）が切れたため、送信済みの部分は使えません。',
  gone: 'このアップロードはサーバーに残っていません（破棄されたか、期限切れで消えました）。',
  permissionLost: 'このプロジェクトにArtifactを追加する権限がなくなりました。',
  otherCredential: 'このアップロードは、別のユーザーか別の認証情報（API tokenなど）で始めたものです。',
  runDeleted: 'このRunは削除されたため、Artifactを追加できません。',
  sizeDiffers: '選んだファイルは、途中のアップロードとサイズが違います。',
  contentDiffers: '選んだファイルは、送信済みの部分と中身が一致しません。別のファイルのようです。',
}, english.resumeBlockerReasons);

/** 本人が次にできること。途中のアップロードの行のボタンの隣に出す。 */
export const resumeBlockerNextSteps: Record<ResumeBlocker, string> = localized({
  expired: '［最初から送る］で、同じ保存パスへ送り直せます。',
  gone: '［最初から送る］で、同じ保存パスへ送り直せます。',
  permissionLost: 'プロジェクトの管理者に Editor 以上の権限を頼んでください。期限までに権限が戻れば、続きから送れます。',
  otherCredential: '始めたときと同じ方法で続きを送るか、［最初から送る］で送り直してください。',
  runDeleted: '別のRunへ送ってください。',
  sizeDiffers: '同じファイルを選び直してください。',
  contentDiffers: '同じファイルを選び直してください。このファイルを新しく送るときは、上の［ファイルを選ぶ］から選んでください。',
}, english.resumeBlockerNextSteps);

// 値を埋め込む文言。catalogのtextTemplatesにまとめる。
export const uploadsTextTemplates = localized({
  uploadSelectedCount: (count: number, totalSize: string) => `${count}件（${totalSize}）`,
  uploadTransferRate: (rate: string) => `${rate}/秒`,
  uploadRemainingTime: (duration: string) => `残り ${duration}`,
  uploadPathExists: (storedAt: string) =>
    `このパスにはファイルがあります（${storedAt} 保存）。送ると新しいバージョンになり、今のものは［詳細］の以前のバージョンに残ります。`,
  uploadPlannedPaths: (examples: string[], rest: number) =>
    `保存パス: ${examples.join('、')}${rest > 0 ? ` ほか${rest}件` : ''}`,
  uploadRetrying: (attempt: number, maxAttempts: number) =>
    `通信が切れたため再試行しています（${attempt}回目 / 最大${maxAttempts}回）`,
  durationSeconds: (seconds: number) => `${seconds}秒`,
  durationMinutes: (minutes: number, seconds: number) => `${minutes}分${seconds}秒`,
  durationHours: (hours: number, minutes: number) => `${hours}時間${minutes}分`,
  uploadResumedBytes: (size: string) => `前回の続きから（${size} は送信済み）`,
  uploadProgressSummary: (done: number, total: number) => `${done} / ${total} 件完了`,
  uploadSessionReceived: (sent: string, total: string) => `${sent} / ${total} 送信済み`,
  uploadResumeMatched: (sent: string, total: string) =>
    `前回の続きから送ります（${sent} / ${total} 送信済み）。保存パスは前回と同じものに合わせました。`,
}, english.uploadsTextTemplates);
