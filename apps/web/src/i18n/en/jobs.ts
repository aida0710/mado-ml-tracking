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
  jobSubmittedAt: "Submission",
  runnerHost: "Runner host",
  jobSiteJobShell: "Job shell version",
  parentJob: "Parent job",
  jobHook: "Hook",
  jobArray: 'array',
  jobChainDepth: "Chain depth",
  gpuCount: "GPU count",
  walltime: "Time limit (HH:MM:SS, optional)",
  walltimeShort: "Time limit",
  walltimePlaceholder: '12:00:00',
  walltimeUnset: "Site default",
  jobRetryOnFailure: "Restart from scratch on failure",
  jobRetryOnTimeout: "Retry from the latest checkpoint on timeout",
  jobAllowChildJobs: "Allow this job's code to create child jobs (driver)",
  jobAutoRetry: "Automatic retries (up to maximum attempts)",
  manualSubmissionTitle: "Jobs waiting for manual submission",
  manualSubmissionHint:
    "The requester can submit queued jobs by running this command on the site (login node or registered PC), using their own API token. If the owner of a shared PC is listening with --all, the owner submits them.",
  manualSubmissionOwnHint:
    "You requested this job. Run this command on the site (login node or registered PC) to submit it using your API token.",
  jobArrays: 'Job array',
  jobArraySize: "Count",
  jobArrayStates: "Status (latest attempt per index)",
  jobArrayShowJobs: "Show jobs",
  jobArrayShowAll: "Show all jobs",
  jobArrayCountsHint: "Counts the latest attempt for each index among jobs loaded in the list.",
  clockDurationError: "Specify time in HH:MM:SS format (e.g. 12:00:00).",
  gpuCountError: `GPU count must be an integer from 0 to ${MAX_JOB_GPU_COUNT}.`,
  arraySizeError: `Array size must be an integer from 1 to ${MAX_JOB_ARRAY_SIZE}.`,
  siteGpuIdsError: "For sites, specify a GPU count instead of GPU IDs.",
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
  manualSubmissionWaiting: (siteName: string, count: number) => `${siteName}: ${count}`,
  jobArrayFilter: (arrayId: string) => `Showing only jobs in array ${arrayId}.`,
  jobArrayState: (stateLabel: string, count: number) => `${stateLabel} ${count}`,
  walltimeError: (maxDays: number) =>
    `Specify a time limit of at most ${maxDays} days in HH:MM:SS format.`,
};

export const logLevelLabels: Record<LogEntry['level'], string> = {
  info: "Information",
  warning: "Warning",
  error: "Error",
};
