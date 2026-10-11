import type { UploadItemStatus } from "../../hooks/useArtifactUploadQueue";

export const uploadsText = {
  uploadChooseFiles: "Choose files",
  uploadChooseFolder: "Choose folder",
  uploadDropHint: "Drop files or folders here",
  uploadDestination: "Destination folder",
  uploadDestinationHint: "Folder uploads preserve their directory structure under this destination.",
  uploadSelectedFiles: "Selected files",
  uploadClearSelection: "Choose again",
  uploadStart: "Start upload",
  uploadQueue: "Upload progress",
  uploadPause: "Pause",
  uploadResume: "Resume",
  uploadCancel: "Cancel",
  uploadRetryFailed: "Retry failed files",
  uploadVerificationFailed: "Server verification failed",
  uploadCancelNotSent: "Could not send cancellation to the server. Uploaded parts expire after seven days.",
  uploadResumableSessions: "Incomplete uploads",
  uploadResumableHint: "Select the same file at the same storage path to resume without resending received parts.",
  uploadDiscardSession: "Discard",
  uploadExpires: "Expires",
  uploadInProgressNotice: "Uploads are in progress. Pause or cancel them before closing.",
} as const;

export const uploadStatusLabels: Record<UploadItemStatus, string> = {
  queued: "Queued",
  preparing: "Preparing",
  uploading: "Sending",
  verifying: "Verifying on server",
  paused: "Pause",
  failed: "Failed",
  canceled: "Canceled",
  completed: "Completed",
};

// Text that embeds values; merged into catalog's textTemplates.
export const uploadsTextTemplates = {
  uploadSelectedCount: (count: number, totalSize: string) => `${count} files (${totalSize})`,
  uploadTransferRate: (rate: string) => `${rate}/s`,
  uploadRemainingTime: (duration: string) => `${duration} remaining`,
  uploadResumedBytes: (size: string) => `Resuming (${size} already sent)`,
  uploadProgressSummary: (done: number, total: number) => `${done} / ${total} completed`,
};
