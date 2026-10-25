import { intlLocaleOf } from '@mado/design-system/locale';
import { formatEnglishCount } from '../formatEnglishCount';
import type { UploadItemStatus } from '../../hooks/useArtifactUploadQueue';
import type { ResumeBlocker } from '../../lib/uploadResumeBlocker';

export const uploadsText = {
  uploadChooseFiles: 'Choose files',
  uploadChooseFolder: 'Choose folder',
  uploadDropHint: 'Drop files or folders here',
  uploadDestination: 'Destination folder',
  uploadDestinationHint: 'Folder uploads preserve their directory structure under this destination.',
  uploadSelectedFiles: 'Selected files',
  uploadClearSelection: 'Choose again',
  uploadStart: 'Start upload',
  uploadQueue: 'Upload progress',
  uploadPause: 'Pause',
  uploadResume: 'Resume',
  uploadCancel: 'Cancel',
  uploadRetryFailed: 'Retry failed files',
  uploadVerificationFailed: 'Server verification failed',
  uploadCancelNotSent: 'Could not send cancellation to the server. Uploaded parts expire after seven days.',
  uploadResumableSessions: 'Incomplete uploads',
  uploadResumableHint: 'Choose the same file to continue without resending the parts already sent.',
  uploadDiscardSession: 'Discard',
  uploadExpires: 'Expires',
  uploadContinue: 'Continue upload',
  uploadStartOver: 'Start over',
  uploadChooseAgain: 'Choose file again',
  uploadOriginalFile: 'Original file',
  uploadSessionExpired: 'Expired',
  uploadResumeChecking: 'Checking whether this is the same file as the incomplete upload…',
  uploadResumePathChanged: 'The storage path was changed, so this file will be sent from the beginning as a new upload.',
  uploadRestoreResumePath: 'Restore storage path',
  uploadRestartFromQueue: 'Press “Resume” to send it again from the beginning.',
  uploadInProgressNotice: 'Uploads are in progress. Pause or cancel them before closing.',
  uploadNetworkLostResume: 'The connection was lost. Check your network, then press “Resume” to continue where it stopped.',
  uploadPathSameContent: 'The content is also the same, so you do not need to upload it.',
  uploadNetworkLostResend: 'The connection was lost. Check your network, then press “Resume” to send it again.',
} as const;

export const uploadStatusLabels: Record<UploadItemStatus, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  uploading: 'Sending',
  verifying: 'Verifying on server',
  paused: 'Paused',
  failed: 'Failed',
  canceled: 'Canceled',
  completed: 'Completed',
};

/** What stopped an unfinished upload from continuing. */
export const resumeBlockerReasons: Record<ResumeBlocker, string> = {
  expired: 'The seven-day deadline has passed, so the parts already sent cannot be used.',
  gone: 'This upload is no longer on the server (it was discarded, or removed after it expired).',
  permissionLost: 'You no longer have permission to add artifacts to this project.',
  otherCredential: 'This upload was started by another user or with another credential (such as an API token).',
  runDeleted: 'This run was deleted, so artifacts cannot be added to it.',
  sizeDiffers: 'The selected file is a different size from the incomplete upload.',
  contentDiffers: 'The selected file does not match the parts already sent. It seems to be a different file.',
};

/** What the person can do next, next to the buttons of the unfinished upload's row. */
export const resumeBlockerNextSteps: Record<ResumeBlocker, string> = {
  expired: 'Use “Start over” to send it again to the same storage path.',
  gone: 'Use “Start over” to send it again to the same storage path.',
  permissionLost:
    'Ask a project administrator for the Editor role or higher. If your access is restored before the deadline, you can continue the upload.',
  otherCredential: 'Continue it the same way it was started, or send it again with “Start over”.',
  runDeleted: 'Upload it to a different run.',
  sizeDiffers: 'Choose the same file again.',
  contentDiffers: 'Choose the same file again. To upload this file as a new one, use “Choose files” above.',
};

// Text that embeds values; merged into catalog's textTemplates.
export const uploadsTextTemplates = {
  uploadSelectedCount: (count: number, totalSize: string) => `${formatEnglishCount(count, 'file')} (${totalSize})`,
  uploadTransferRate: (rate: string) => `${rate}/s`,
  uploadRemainingTime: (duration: string) => `${duration} remaining`,
  uploadPathExists: (storedAt: string) =>
    `A file already exists at this path (stored ${storedAt}). Uploading creates a new version, and the current one stays under “Previous versions” in “Details”.`,
  uploadPlannedPaths: (examples: string[], rest: number) =>
    `Storage paths: ${examples.join(', ')}${rest > 0 ? ` and ${rest.toLocaleString(intlLocaleOf('en'))} more` : ''}`,
  uploadRetrying: (attempt: number, maxAttempts: number) =>
    `Connection lost. Retrying (attempt ${attempt} of ${maxAttempts})`,
  durationSeconds: (seconds: number) => `${seconds}s`,
  durationMinutes: (minutes: number, seconds: number) => `${minutes}m ${seconds}s`,
  durationHours: (hours: number, minutes: number) => `${hours}h ${minutes}m`,
  uploadResumedBytes: (size: string) => `Resuming (${size} already sent)`,
  uploadProgressSummary: (done: number, total: number) => `${done} / ${total} completed`,
  uploadSessionReceived: (sent: string, total: string) => `${sent} / ${total} sent`,
  uploadResumeMatched: (sent: string, total: string) =>
    `Continuing from the previous upload (${sent} / ${total} sent). The storage path was set to match the previous one.`,
};
