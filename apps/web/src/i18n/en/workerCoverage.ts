import type { WorkerCapability } from '@mmt/contracts';
import { formatEnglishCount } from '../formatEnglishCount';

// workerがコンピュータのJobと接続確認を受け取るかどうか（lib/workerCoverage）。Compute、Jobs、
// Sweep、全体設定 → コンピュータの画面と、Jobの起動のダイアログに出す。
export const workerCoverageText = {
  workerCoverageColumn: "Worker",
  workerCoverageAnyProject: "Worker (any project)",
  workerCoverageAnyProjectHint:
    "A job is taken only by a worker of its own project. Check each project's status on that project's “Compute” page.",
  workerCoverageNone: "No worker",
  workerCoverageOffline: "Worker offline",
  workerCoverageNotNeeded: "Not needed (site)",
  workerCoverageSetupLink: "Open worker setup",
  workerCoverageSetupByOwner:
    "Workers are run by this computer's owner (or by a global administrator if it has no owner).",
  queuedJobNotTaken:
    "A worker for this computer is responding but has not taken this job yet. Possible reasons:",
  queuedJobNotTakenReasons: [
    "The computer is already running its maximum number of concurrent jobs",
    "Another job is using the selected GPUs",
    "The computer is disabled",
    "The computer does not support the code's runtime",
    "The computer is Local, and the API server does not allow the local executor (MMT_ALLOW_LOCAL_EXECUTOR)",
  ],
  queuedJobNeedsWorkerUpdate:
    "A worker for this computer is responding but does not support the following, which this job needs. It takes the job once it is updated to a newer mado-tracking.",
  launchWorkerMissingHint: "If you launch now, the job stays queued until a worker runs.",
  queuedJobWaitsForWorker: "This job stays queued until a worker runs.",
  sweepTrialsWaitForWorker:
    "This sweep's trials run on this computer, so they will not start until a worker runs.",
  workerlessJobsTitle: "Queued jobs that cannot start",
  workerlessJobsHint:
    "The following computers have no worker assigned, or their workers are not responding. Queued jobs will not start until a worker runs.",
  targetCheckWorkerMissing:
    "No worker that names this computer (MMT_WORKER_TARGET_IDS) is responding, so a connection check would fail after five minutes. Start a worker first.",
} as const;

export const workerCapabilityLabels: Record<WorkerCapability, string> = {
  workflowDatasetUsage:
    "Workflow steps (passing the dataset usage, weights and selection conditions to the execution code)",
};

// 値を埋め込む文言。
export const workerCoverageTextTemplates = {
  workerCoverageOnline: (count: number) => `${formatEnglishCount(count, 'worker')} online`,
  workerCoverageOfflineSince: (lastSeen: string) => `Last response: ${lastSeen}`,
  targetWorkerNone: (targetName: string) => `No worker is assigned to “${targetName}”.`,
  targetWorkerOffline: (targetName: string, lastSeen: string) =>
    `No worker for “${targetName}” is responding (last response: ${lastSeen}).`,
  targetChoiceWorkerMissing: (label: string, status: string) => `${label} (${status})`,
  workerlessJobsCount: (targetName: string, count: number) =>
    `${targetName}: ${formatEnglishCount(count, 'queued job')}`,
};
