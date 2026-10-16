import type { ExecutionRuntimeKind } from './executionRuntime.js';
import type { ComputeTarget } from './index.js';
import type { CpuArch } from './siteExecution.js';

// What a worker does on a ComputeTarget for the Web, over its own SSH key: a connection check, or
// reading one directory while the computer is set up. The API never connects to the target; it
// only queues the request and stores the result.
export type TargetCheckKind = 'connection' | 'directory_listing';
export const TARGET_CHECK_KINDS: readonly TargetCheckKind[] = ['connection', 'directory_listing'];

export type TargetCheckStatus = 'queued' | 'claimed' | 'finished' | 'failed';

// Why a check ended without a result from the worker.
// no_worker: no worker in charge of the target (or the chosen worker) claimed it in time.
// claim_timeout: the claiming worker did not report back in time.
export type TargetCheckFailureReason = 'no_worker' | 'claim_timeout';

/** A worker as the API keeps it (WorkerPresence): its worker token and its MMT_WORKER_ID. */
export interface TargetCheckWorker {
  tokenId: string;
  workerId: string;
}

/**
 * POST /targets/:id/checks. With `worker`, only that worker claims the check, whether or not its
 * MMT_WORKER_TARGET_IDS names the computer (a computer being added is in no worker's settings).
 * Without it, a worker whose MMT_WORKER_TARGET_IDS names the computer does, as before.
 */
export interface TargetCheckRequest {
  worker?: TargetCheckWorker;
}

export type TargetCheckItemName =
  | 'connection'
  | 'python'
  | 'venv'
  | 'pip'
  | 'git'
  | 'docker'
  | 'apptainer'
  | 'singularity'
  | 'gpu'
  | 'work_directory'
  | 'api';

// ng is a problem for Jobs that need the item; unavailable means the item is optional
// (for example docker on a Python-only target) and was not found.
export type TargetCheckItemStatus = 'ok' | 'ng' | 'unavailable' | 'skipped';

// Machine-readable reason for ng/unavailable/skipped; the Web shows a fix hint per code.
// work_directory_not_set: the computer has no work directory yet (skipped while it is set up).
export type TargetCheckItemCode =
  | 'ssh_failed'
  | 'ssh_configuration'
  | 'probe_failed'
  | 'python_missing'
  | 'python_too_old'
  | 'venv_missing'
  | 'pip_missing'
  | 'git_missing'
  | 'docker_missing'
  | 'docker_socket_denied'
  | 'docker_daemon_unreachable'
  | 'container_cli_missing'
  | 'container_flags_missing'
  | 'nvidia_smi_missing'
  | 'nvidia_smi_failed'
  | 'work_directory_not_writable'
  | 'work_directory_not_set'
  | 'api_unreachable'
  | 'connection_failed';

export interface TargetCheckItem {
  name: TargetCheckItemName;
  status: TargetCheckItemStatus;
  code: TargetCheckItemCode | null;
  // Short fact such as a version string; never a key path, token or command output dump.
  detail: string | null;
}

// One row of `nvidia-smi --query-gpu=index,uuid,name,memory.total`.
export interface TargetCheckGpu {
  index: string;
  uuid: string;
  name: string;
  memoryTotalMiB: number;
}

/** The machine the worker reached, as it reported itself; null for what it did not tell. */
export interface TargetCheckHost {
  /** `uname -m`, such as x86_64 or aarch64. */
  machine: string | null;
  /** `machine` as a CpuArch; null when it is none the contract knows. */
  cpuArch: CpuArch | null;
  cpuCount: number | null;
  memoryTotalBytes: number | null;
  homeDirectory: string | null;
}

/** A Python interpreter found on the computer (on PATH, in /usr/bin, in venvs and conda envs). */
export interface TargetCheckPython {
  path: string;
  /** Such as "3.11.9"; null when the interpreter did not answer. */
  version: string | null;
}

/** Where a directory candidate was found. */
export type TargetCheckDirectorySource = 'home' | 'home_child' | 'mount';

/** A directory that could hold the work directory: the home, a directory in it, or a mount. */
export interface TargetCheckDirectory {
  path: string;
  source: TargetCheckDirectorySource;
  writable: boolean;
  freeBytes: number | null;
}

interface TargetCheckFacts {
  items: TargetCheckItem[];
  // null when nvidia-smi is unavailable; GPU values are only what nvidia-smi reported.
  gpus: TargetCheckGpu[] | null;
  // Runtime kinds whose checks passed; offered as candidates, never applied automatically.
  runtimeKinds: ExecutionRuntimeKind[];
  workDirectoryFreeBytes: number | null;
}

/**
 * Version 2 adds what the setup of a computer is filled in from: the machine, its Pythons and the
 * directories that could hold the work directory. Candidates are only offered, never applied.
 */
export interface TargetCheckResultV2 extends TargetCheckFacts {
  version: 2;
  host: TargetCheckHost;
  pythons: TargetCheckPython[];
  directories: TargetCheckDirectory[];
}

export type TargetCheckResult = TargetCheckResultV2;

export interface TargetCheck {
  id: string;
  targetId: string;
  requestedBy: string;
  status: TargetCheckStatus;
  /** The worker that claimed the check. */
  workerId: string | null;
  /** The worker the requester chose; null when any worker in charge of the computer may claim it. */
  assignedWorker: TargetCheckWorker | null;
  result: TargetCheckResult | null;
  failureReason: TargetCheckFailureReason | null;
  createdAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
}

// Paths a person types for a computer (directories to read) and paths a worker reports.
export const MAX_TARGET_PATH_LENGTH = 1024;

/** POST /targets/:id/directory-listings: read one directory of the computer through `worker`. */
export interface TargetDirectoryListingRequest {
  /** Absolute, or starting with ~ for the home directory of the SSH user. */
  path: string;
  worker: TargetCheckWorker;
}

// ok: listed. missing/not_directory/denied: the computer could not read it as a directory.
// unreachable: the worker could not connect (the listing ends as failed).
export type TargetDirectoryListingOutcome =
  | 'ok'
  | 'missing'
  | 'not_directory'
  | 'denied'
  | 'unreachable';

export interface TargetDirectoryEntry {
  /** The entry's name in the directory, without the directory. */
  name: string;
  kind: 'directory' | 'file';
  /** A file the SSH user may execute (a Python interpreter is one). */
  executable: boolean;
}

export interface TargetDirectoryListingResult {
  /** The directory the computer read, with ~ expanded. */
  path: string;
  outcome: TargetDirectoryListingOutcome;
  /** In the computer's order; only the first ones of a large directory. */
  entries: TargetDirectoryEntry[];
  /** The directory had more entries than were listed. */
  truncated: boolean;
}

export interface TargetDirectoryListing {
  id: string;
  targetId: string;
  /** As requested. */
  path: string;
  assignedWorker: TargetCheckWorker;
  status: TargetCheckStatus;
  workerId: string | null;
  result: TargetDirectoryListingResult | null;
  failureReason: TargetCheckFailureReason | null;
  createdAt: string;
  finishedAt: string | null;
}

/**
 * Files a worker found in its own ~/.ssh (and MMT_WORKER_SSH_DIR): candidates for a computer's
 * key and known_hosts paths, which name files on the worker's host. Paths only, never contents or
 * fingerprints.
 */
export interface WorkerSshFiles {
  keyPaths: string[];
  knownHostsPaths: string[];
}

/**
 * GET /targets/check-workers: an online worker one may ask to check a computer and to read its
 * directories. Only workers that report their SSH files take checks assigned to them.
 */
export interface TargetCheckWorkerPresence {
  tokenId: string;
  tokenName: string;
  projectId: string;
  workerId: string;
  hostname: string;
  version: string;
  lastSeenAt: string;
  sshFiles: WorkerSshFiles;
}

export interface WorkerTargetCheckClaim {
  workerId: string;
  /** MMT_WORKER_TARGET_IDS: unassigned connection checks of these computers. May be empty. */
  targetIds?: string[];
  /** What the worker does. */
  kinds: TargetCheckKind[];
  /**
   * Requests the worker is running now. A request it claimed but is not running (a lost claim
   * response) comes back with the same lease before a new one is claimed.
   */
  activeCheckIds?: string[];
}

// The lease is returned only to the claiming worker and must accompany the completion.
// `check` is the request as it stands when claimed (no result yet), for both kinds.
export interface WorkerTargetCheck {
  check: TargetCheck;
  leaseId: string;
  target: ComputeTarget;
  kind: TargetCheckKind;
  /** directory_listing: the directory to read, as requested; null for a connection check. */
  directoryPath: string | null;
}

export interface WorkerTargetCheckComplete {
  leaseId: string;
  // failed: the worker could not run the probe or reach the computer (its result explains why).
  status: 'finished' | 'failed';
  // A TargetCheckResult for a connection check, a TargetDirectoryListingResult for a listing.
  result: TargetCheckResult | TargetDirectoryListingResult;
}
