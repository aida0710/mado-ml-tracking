import type {
  ComputeTarget,
  CpuArch,
  SiteSubmissionMode,
  TargetCheckItemCode,
  TargetCheckItemName,
  TargetCheckItemStatus,
} from '@mmt/contracts';
import { formatEnglishCount } from '../formatEnglishCount';

// Worker presence, Job heartbeat and target connection check labels on the Compute and Jobs pages.
export const computeText = {
  workers: 'Workers',
  workerId: 'Worker ID',
  workerStatus: "Connection status",
  workerOnline: "Online",
  workerOffline: "Offline",
  workerVersion: "Version",
  workerHostname: "Hostname",
  workerToken: "Token",
  workerTargets: "Assigned computers",
  workerAllTargets: "All",
  workerLastSeen: "Last response",
  workerActiveJobs: "Assigned jobs",
  noWorkers: "No workers have connected to this project yet",
  workerOfflineHint: "No response for over 120 seconds",
  jobUnresponsive: "No response",
  jobUnresponsiveHint: "No heartbeat for over 60 seconds. Job status and GPU reservations are kept unchanged.",
  datasetCacheMaxGiB: "Dataset cache limit (GiB)",
  datasetTransfer: "Dataset transfer",
  datasetTransferRelay: "Relay through worker",
  datasetTransferDirect: "Computer downloads directly from the API",
  checkTarget: "Check connection",
  targetCheck: "Connection check",
  targetCheckHint:
    "The worker that last checked this computer (or one whose MMT_WORKER_TARGET_IDS includes it) checks the SSH connection. The API server does not connect to the computer.",
  targetCheckHintLocal:
    "The worker that last checked this computer (or one whose MMT_WORKER_TARGET_IDS includes it) checks by running a command on its own host.",
  targetCheckLocalConnection: "Command execution",
  targetLocationLocal: "On the worker host",
  targetCheckNone: "Connection has not been checked yet",
  targetCheckWaiting: "Waiting for worker response",
  targetCheckRequestedAt: "Request",
  targetCheckFinishedAt: "Completed",
  targetCheckWorker: "Worker that checked",
  targetCheckItem: "Item",
  targetCheckOutcome: "Outcome",
  targetCheckDetail: "Details",
  targetCheckAction: "Resolution",
  targetCheckNoWorker:
    "No worker claimed the check within five minutes. Verify that the worker that last checked this computer (or one whose MMT_WORKER_TARGET_IDS includes it) is running.",
  targetCheckClaimTimeout: "No result received from the worker. Check the worker logs.",
  targetCheckFreeSpace: "Free space in working directory",
  detectedGpus: "Detected GPUs",
  gpuIndex: 'Index',
  gpuName: "Name",
  gpuMemory: "Memory",
  gpuUuid: 'UUID',
  noDetectedGpus: "nvidia-smi reported no GPUs",
  targetCheckCandidates: "Suggested settings",
  targetCheckCandidatesHint:
    "These values were selected from the check results. Computer settings are kept unchanged until you save.",
  targetCheckCurrent: "Current",
  saveTargetCandidates: "Save selected settings",
  targetCheckCandidatesSaved: "Computer settings saved",
  // Sites: their connection, accounts and job shell are set here; the launcher makes their keys.
  siteExecutor: "Site (launcher or mado-tracking submit)",
  submissionMode: "Submission mode",
  submissionModeAutomatic: "Automatic (launcher submits)",
  submissionModeManual: "Manual (requester uses mado-tracking submit)",
  cpuArch: "CPU architecture",
  supportsArray: "Job shell supports arrays in a single submission",
  queueTimeout: "Queue timeout (HH:MM:SS, optional)",
  // Three days is a common upper bound of batch queues.
  queueTimeoutPlaceholder: '72:00:00',
  siteRuntimeKinds: "Supported runtimes (containers only for sites)",
  siteTargetNotice:
    "Configure the site's connection, account, and job shell here. The launcher generates SSH keys, and only the public key is shown in the web UI. The private key stays on the launcher host.",
  targetGpuPerJob: "Specified per job",
  submissionAutomaticBadge: "Automatic submission",
  submissionManualBadge: "Manual submission",
  supportsArrayBadge: "Array support",
  siteRuntimeKindsError:
    "Select at least one site runtime: Docker, Singularity, or Apptainer.",
};

// Text that embeds values.
export const computeTextTemplates = {
  queueTimeoutError: (minMinutes: number, maxDays: number) =>
    `Specify a queue timeout between ${formatEnglishCount(minMinutes, 'minute')} and ${formatEnglishCount(maxDays, 'day')} in HH:MM:SS format.`,
};

export const computeTargetExecutorLabels: Record<ComputeTarget['executor'], string> = {
  ssh: 'SSH',
  local: 'Local',
  site: 'Site',
};

export const submissionModeBadgeLabels: Record<SiteSubmissionMode, string> = {
  automatic: computeText.submissionAutomaticBadge,
  manual: computeText.submissionManualBadge,
};

export const cpuArchLabels: Record<CpuArch, string> = {
  amd64: 'amd64 (x86_64)',
  arm64: 'arm64 (AArch64)',
};

export const targetCheckItemLabels = {
  connection: "SSH connection",
  python: 'Python',
  venv: 'venv',
  pip: 'pip',
  git: 'git',
  docker: 'Docker',
  apptainer: 'Apptainer',
  singularity: 'Singularity',
  gpu: 'GPU (nvidia-smi)',
  work_directory: "Working directory",
  api: "API access",
} satisfies Record<TargetCheckItemName, string>;

export const targetCheckOutcomeLabels = {
  ok: 'OK',
  ng: "Failed",
  unavailable: "None",
  skipped: "Not checked",
} satisfies Record<TargetCheckItemStatus, string>;

// One short fix per reason code; shown next to the failing item.
export const targetCheckCodeHints = {
  ssh_failed: "Check the host, port, username, SSH key, and known_hosts configuration.",
  ssh_configuration:
    "The worker host is missing a key or known_hosts file, or the key's permissions are not 600. Check with mado-tracking-worker doctor.",
  connection_failed: "The worker could not start a command on this computer",
  probe_failed: "The check script could not run. Specify Python 3.11 or later.",
  python_missing: "No Python executable at pythonExecutable",
  python_too_old: "Set pythonExecutable to Python 3.11 or later",
  venv_missing: "Install the venv module (python3-venv on Debian/Ubuntu)",
  pip_missing: "Install pip or ensurepip",
  git_missing: "git is required to execute Git source code",
  docker_missing: "Install Docker to use the Docker runtime",
  docker_socket_denied: "Add the SSH user to the docker group",
  docker_daemon_unreachable: "Check that the Docker daemon is running",
  container_cli_missing: "Install this runtime to use containers",
  container_flags_missing:
    "Required exec options (--containall, --no-mount, --nv, etc.) are unavailable. Update to a newer version.",
  nvidia_smi_missing: "Install the NVIDIA driver and nvidia-smi to use GPUs",
  nvidia_smi_failed: "nvidia-smi failed. Check the driver status.",
  work_directory_not_writable: "Specify a directory writable by the SSH user",
  work_directory_not_set: "Working directory is not set yet (select it after connecting)",
  api_unreachable:
    "The computer cannot reach the worker's MMT_API_URL. Check the route and URL; access is required to record jobs.",
} satisfies Record<TargetCheckItemCode, string>;
