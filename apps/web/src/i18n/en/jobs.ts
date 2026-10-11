import { formatEnglishCount } from '../formatEnglishCount';
import {
  MAX_JOB_ARRAY_SIZE,
  MAX_JOB_GPU_COUNT,
  type JobEndReason,
  type JobPhase,
  type LogEntry,
} from '@mmt/contracts';

// Jobs list and Run logs, with the site Job details (phase, scheduler, array, origin).
export const jobsText = {
  jobColumn: 'Job',
  jobRunColumn: 'Run',
  jobActions: "Actions",
  logLevelAll: "All levels",
  jobPhase: "Phase",
  jobLauncherWaiting: "Queued (waiting for launcher submission)",
  jobEndReason: "End reason",
  jobWhere: "Execution location",
  jobOrigin: "Launch source",
  schedulerJobId: "Scheduler job ID",
  schedulerJobIdShort: "Job ID",
  jobSubmittedAt: "Submitted",
  runnerHost: "Runner host",
  jobSiteJobShell: "Job shell version",
  parentJob: "Parent job",
  jobHook: "Hook",
  jobArray: 'array',
  jobChainDepth: "Chain depth",
  gpuCount: "GPU count",
  walltime: "Time limit (HH:MM:SS, optional)",
  walltimeShort: "Time limit",
  walltimePlaceholder: "Site default if blank (e.g. 12:00:00)",
  walltimeUnset: "Site default",
  jobRetryOnFailure: "Restart from scratch on failure",
  jobRetryOnTimeout: "Retry from the latest checkpoint on timeout",
  jobAllowChildJobs: "Allow this job's code to create child jobs (driver)",
  jobAutoRetry: "Automatic retries (up to maximum attempts)",
  manualSubmissionTitle: "Jobs waiting for manual submission",
  manualSubmissionHint:
    "The requester can submit queued jobs by running this command on the site (login node or registered PC), using their own API token. If the owner of a shared PC is listening with --all, the owner submits them.",
  launchManualSubmissionNotice:
    "This computer uses manual submission. Launched jobs wait until the requester runs the following command on that computer.",
  manualSubmissionOwnHint:
    "You requested this job. Run this command on the site (login node or registered PC) to submit it using your API token.",
  jobArrays: 'Job array',
  jobArraySize: "Size",
  jobArrayStates: "Status (latest attempt per index)",
  jobArrayShowJobs: "Show jobs",
  jobArrayShowAll: "Show all jobs",
  jobArrayCountsHint: "Counts the latest attempt for each index among jobs loaded in the list.",
  clockDurationError: "Specify time in HH:MM:SS format (e.g. 12:00:00).",
  gpuCountError: `GPU count must be an integer from 0 to ${MAX_JOB_GPU_COUNT}.`,
  arraySizeError: `Array size must be an integer from 1 to ${MAX_JOB_ARRAY_SIZE}.`,
  siteGpuIdsError: "For sites, specify a GPU count instead of GPU IDs.",
  jobCreatedBy: "Created by",
  jobControlOwnerOnly: "Only the creator or a project administrator can stop or rerun",
  jobCancelTitle: "Stop job",
  jobCancelConfirm: "Stop",
  jobCancelEndsAtOnce: "The job has not started running yet, so it is canceled immediately.",
  jobCancelRequestsStop:
    "Asks the running process to stop. The status stays Running until the worker stops it. Child jobs created from this job are stopped as well.",
  jobRetryTitle: "Rerun as a new run",
  jobRetryConfirm: "Rerun",
  jobRetryEffect:
    "The original run and job are kept. A new run and job are created and executed with the same settings, and you are taken to the new run.",
  logsSearch: "Search logs",
  logsSearchPlaceholder: "Search term (e.g. Error)",
  logsOrder: "Sort by",
  logsOldestFirst: "Oldest first",
  logsNewestFirst: "Newest first",
  logsJumpToLatest: "Jump to latest",
  logsDownload: "Download",
  logsReadAll: "Load all lines",
  logsUpdatesPaused: "These lines are as of the last load and do not update automatically.",
  logsReadNewLines: "Load new lines",
  logsFollowLatest: "Resume automatic updates",
  logsNoMatch: "No matching lines",
  jobDetailClose: "Hide details",
  runOpenJob: "View job",
  launchClearedCodeVersion:
    "The selected code version does not match the run kind or model version, so it was cleared. Select a code version again.",
  launchClearedTarget:
    "The selected computer cannot use this code version's runtime, so it was cleared. Select a computer again.",
  launchClearedGpus: "The selected GPUs were cleared because the computer changed.",
  launchGpuChoice: "GPUs (CPU only if none selected)",
  launchFromTaskHint:
    "To run the same code, parameters, and computer repeatedly, save them as a task and launch with those defaults filled in.",
  launchOpenTasks: "Open Tasks",
  maxAttemptsHint:
    "Automatic retries stop at this number of attempts. Reruns started with “Rerun as a new run” on the Jobs page are not counted.",
} as const;

export const jobPhaseLabels: Record<JobPhase, string> = {
  waiting_manual: "Waiting for manual submission",
  submitting: "Submitting",
  submitted: "In scheduler queue",
  waiting_resources: "Preparing / Waiting for GPU",
  running: "Running",
};

export const jobEndReasonLabels: Record<JobEndReason, string> = {
  timed_out: "Timed out",
  queue_timeout: "Queue timeout",
  submit_failed: "Submission failed",
};

// Text that embeds values.
export const jobsTextTemplates = {
  gpuCount: (count: number) => `GPU ×${count}`,
  arrayMember: (index: number, size: number) => `${index} / ${size}`,
  arraySize: (size: number) => `array ×${size}`,
  manualSubmissionWaiting: (siteName: string, count: number) => `${siteName}: ${formatEnglishCount(count, 'job')}`,
  jobArrayFilter: (arrayId: string) => `Showing only jobs in array ${arrayId}.`,
  jobArrayState: (stateLabel: string, count: number) => `${stateLabel} ${count}`,
  walltimeError: (maxDays: number) =>
    `Specify a time limit of at most ${maxDays} days in HH:MM:SS format.`,
  jobActionTarget: (job: { runName: string; createdByName: string; targetName: string }) =>
    `Run “${job.runName}” · Created by: ${job.createdByName} · Execution computer: ${job.targetName}`,
  logsShowingLatest: (shown: number, total: number) =>
    `Showing the latest ${shown.toLocaleString('en-US')} of ${formatEnglishCount(total, 'line')}. Search and level filters apply only to these lines. Downloads include all lines.`,
  logsMatchCount: (count: number) => formatEnglishCount(count, 'matching line'),
  logsReadLatestLines: (count: number) => `Load the latest ${formatEnglishCount(count, 'line')}`,
  attempt: (attempt: number, maxAttempts: number) => `${attempt} / ${maxAttempts}`,
  attemptPastLimit: (attempt: number, maxAttempts: number) =>
    `${attempt} (automatic retries stop at attempt ${maxAttempts})`,
  jobSweepTrialOrigin: (sweepName: string, trialIndex: number) =>
    `Sweep: ${sweepName} #${trialIndex}`,
  jobAutomationOrigin: (ruleName: string) => `Automation: ${ruleName}`,
  launchCodesHidden: (kindLabel: string, hiddenCount: number) =>
    `Only code versions that match the run kind “${kindLabel}” and the model version can be selected (${formatEnglishCount(hiddenCount, 'other version')} hidden). To use other code, change the run kind first.`,
};

export const logLevelLabels: Record<LogEntry['level'], string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};
