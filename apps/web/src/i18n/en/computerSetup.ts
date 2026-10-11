import type { TargetDirectoryListingOutcome } from '@mmt/contracts';

// Adding and editing an ssh or local computer in two steps: 1「接続」(how a worker reaches it)
// and 2「接続後の設定」(what its Jobs use), filled in from a worker's connection check.
export const computerSetupText = {
  setupStepConnection: "Connection",
  setupStepSettings: "Post-connection settings",
  computerKindLegend: "Type",
  computerKindSshHint: "A worker connects over SSH to run jobs (GPU servers, login nodes, etc.).",
  computerKindLocalHint: "Runs jobs on the worker's own host (development only).",
  computerKindSiteHint:
    "A launcher or mado-tracking submit submits to a job scheduler (supercomputers, etc.).",
  computerKindFixed: "The kind cannot be changed for an existing computer.",
  checkWorker: "Worker for this connection",
  checkWorkerHint:
    "This worker checks the connection using its own SSH key. Select SSH key and known_hosts paths from files on this worker's host.",
  checkWorkerLocalHint: "This worker checks on its own host.",
  checkWorkersNone:
    "No online worker can check the connection. Start a worker and press “Refresh workers”, or continue without checking and enter the settings manually.",
  checkWorkersReload: "Refresh workers",
  sshFileHintNoWorker: "Select a worker to see keys available on its host.",
  checkAndContinue: "Check connection and continue",
  continueWithoutCheck: "Continue without checking",
  recheck: "Check again",
  recheckHint: "Unsaved connection changes will be saved before checking.",
  checkQueued: "Waiting for the worker to start checking…",
  checkRunning: "The worker is checking the connection…",
  checkReached: "Connection verified",
  checkNotReached: "Could not verify connection",
  checkNoWorkerShort:
    "The selected worker did not claim the check. Verify that it is running.",
  checkClaimTimeoutShort: "No result received from the worker. Check its logs.",
  checkFailedNext:
    "Fix the connection and press “Check connection and continue”, or choose “Continue without checking” to enter settings manually.",
  checkDetails: "Check details",
  setupWithoutCheck:
    "No connection check results are available. Enter the working directory and Python path manually.",
  setupFromCheck: "Filled in from connection check results. Adjust if needed.",
  workDirectoryHint:
    "Stores job directories and the dataset cache. Enter a path ending in / to let the worker list its contents.",
  pythonExecutableHint: "Used for Python jobs and the runner (3.11 or later).",
  directoryListingLoading: "The worker is listing directories…",
  directoryListingFailed: "Could not list directories (worker did not respond)",
  directoryListingTruncated: "There are many items. Only the first entries are shown.",
  directoryWritable: "Writable",
  directoryNotWritable: "Not writable",
  pythonVersionUnknown: "Unknown version",
  runtimeKindsFromCheck: "Runtimes that worked during the check are selected.",
  detectedGpusLegend: "GPUs (detected)",
  gpuIdsManualHint:
    "Enter these manually if jobs run on a different computer from the one checked, such as when submitting from a login node.",
  maxConcurrentJobsHint: "Defaults to the number of selected GPUs (1 if there are none).",
  enabledHint: "Enabling this computer allows jobs to start on it.",
  hostFacts: "Computer",
} as const;

export const computerSetupTextTemplates = {
  checkWorkerLabel: (workerId: string, hostname: string | null) =>
    hostname ? `${workerId}（${hostname}）` : workerId,
  checkWorkerSource: (tokenName: string) => `token: ${tokenName}`,
  cpuArchDetected: (machine: string) => `Detected: ${machine}`,
  cpuArchUnknown: (machine: string) =>
    `The detected architecture is ${machine}. Select the matching architecture.`,
  hostFactsSummary: (facts: string[]) => facts.join(' · '),
  cpuCount: (count: number) => `${count} cores`,
  directoryFree: (free: string) => `${free} free`,
  gpuOption: (index: string, name: string, memory: string) => `${index}: ${name}（${memory}）`,
};

export const directoryListingOutcomeNotes = {
  ok: '',
  missing: "This directory does not exist",
  not_directory: "Not a directory",
  denied: "Cannot read this directory (permission denied)",
  unreachable: "The worker could not connect",
} satisfies Record<TargetDirectoryListingOutcome, string>;
