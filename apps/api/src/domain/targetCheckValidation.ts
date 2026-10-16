import {
  CPU_ARCHES,
  TARGET_CHECK_KINDS,
  type TargetCheckResult,
  type TargetDirectoryListingResult,
} from '@mmt/contracts';
import { z } from 'zod';
import { DomainError } from './errors.js';
import { hasNoControlCharacters, reportedPathSchema } from './reportedPathValidation.js';
import { runtimeKindSchema } from './runtimeValidation.js';
import { uuidSchema } from './validation.js';

// The result is a short summary; a larger body means the worker sent raw command output. Version 2
// adds the candidate lists (pythons, directories), whose paths take most of this room.
export const MAX_TARGET_CHECK_RESULT_BYTES = 32 * 1024;
// A listing holds up to MAX_DIRECTORY_LISTING_ENTRIES names of up to a file name's length each.
export const MAX_DIRECTORY_LISTING_RESULT_BYTES = 64 * 1024;
// Generous for one host (DGX-class machines have 8-16 GPUs).
const MAX_TARGET_CHECK_GPUS = 64;
// Pythons on PATH, in /usr/bin and in a researcher's venvs and conda envs; more are not read.
const MAX_TARGET_CHECK_PYTHONS = 20;
// The home, the directories in it and the mounts that could hold a work directory.
const MAX_TARGET_CHECK_DIRECTORIES = 40;
// Enough to pick a directory while typing; a larger directory is marked truncated.
const MAX_DIRECTORY_LISTING_ENTRIES = 200;
// NAME_MAX of Linux file systems.
const MAX_DIRECTORY_ENTRY_NAME_LENGTH = 255;
// Long enough for a version line or a GPU model name, too short for a log dump.
const MAX_DETAIL_LENGTH = 200;
// Matches the worker id of workers (migration 019) and of claims.
const MAX_WORKER_ID_LENGTH = 200;
// A worker runs a couple of requests at once (MAX_PARALLEL_TARGET_CHECKS in the worker).
const MAX_ACTIVE_CHECKS_PER_WORKER = 16;

const ITEM_NAMES = [
  'connection',
  'python',
  'venv',
  'pip',
  'git',
  'docker',
  'apptainer',
  'singularity',
  'gpu',
  'work_directory',
  'api',
] as const;

const ITEM_CODES = [
  'ssh_failed',
  'ssh_configuration',
  'probe_failed',
  'python_missing',
  'python_too_old',
  'venv_missing',
  'pip_missing',
  'git_missing',
  'docker_missing',
  'docker_socket_denied',
  'docker_daemon_unreachable',
  'container_cli_missing',
  'container_flags_missing',
  'nvidia_smi_missing',
  'nvidia_smi_failed',
  'work_directory_not_writable',
  'work_directory_not_set',
  'api_unreachable',
  'connection_failed',
] as const;

const shortTextSchema = z
  .string()
  .max(MAX_DETAIL_LENGTH)
  .refine(hasNoControlCharacters, 'Control characters are not allowed');

const itemSchema = z
  .strictObject({
    name: z.enum(ITEM_NAMES),
    status: z.enum(['ok', 'ng', 'unavailable', 'skipped']),
    code: z.enum(ITEM_CODES).nullable(),
    detail: shortTextSchema.nullable(),
  })
  .refine((item) => (item.status === 'ok') === (item.code === null), {
    message: 'Only ok items have no code',
  });

const gpuSchema = z.strictObject({
  index: z.string().regex(/^\d{1,3}$/),
  uuid: shortTextSchema.min(1),
  name: shortTextSchema.min(1),
  memoryTotalMiB: z.number().int().min(0),
});

const hostSchema = z.strictObject({
  machine: shortTextSchema.min(1).nullable(),
  cpuArch: z.enum(CPU_ARCHES).nullable(),
  cpuCount: z.number().int().min(1).nullable(),
  memoryTotalBytes: z.number().int().min(0).nullable(),
  homeDirectory: reportedPathSchema.nullable(),
});

const pythonSchema = z.strictObject({
  path: reportedPathSchema,
  version: z
    .string()
    .regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/)
    .nullable(),
});

const directorySchema = z.strictObject({
  path: reportedPathSchema,
  source: z.enum(['home', 'home_child', 'mount']),
  writable: z.boolean(),
  freeBytes: z.number().int().min(0).nullable(),
});

const factsShape = {
  items: z
    .array(itemSchema)
    .min(1)
    .max(ITEM_NAMES.length)
    .refine((items) => new Set(items.map((item) => item.name)).size === items.length, {
      message: 'Item names must be unique',
    }),
  gpus: z.array(gpuSchema).max(MAX_TARGET_CHECK_GPUS).nullable(),
  runtimeKinds: z
    .array(runtimeKindSchema)
    .refine((kinds) => new Set(kinds).size === kinds.length, { message: 'Must be unique' }),
  workDirectoryFreeBytes: z.number().int().min(0).nullable(),
};

const uniquePaths = <T extends { path: string }>(values: T[]) =>
  new Set(values.map((value) => value.path)).size === values.length;

export const targetCheckResultSchema = z.strictObject({
  version: z.literal(2),
  ...factsShape,
  host: hostSchema,
  pythons: z
    .array(pythonSchema)
    .max(MAX_TARGET_CHECK_PYTHONS)
    .refine(uniquePaths, { message: 'Paths must be unique' }),
  directories: z
    .array(directorySchema)
    .max(MAX_TARGET_CHECK_DIRECTORIES)
    .refine(uniquePaths, { message: 'Paths must be unique' }),
});

const directoryEntrySchema = z.strictObject({
  name: z
    .string()
    .min(1)
    .max(MAX_DIRECTORY_ENTRY_NAME_LENGTH)
    .refine(hasNoControlCharacters, 'Control characters are not allowed')
    .refine((name) => !name.includes('/') && name !== '.' && name !== '..', {
      message: 'Must be a name in the directory',
    }),
  kind: z.enum(['directory', 'file']),
  executable: z.boolean(),
});

export const directoryListingResultSchema = z.strictObject({
  path: reportedPathSchema,
  outcome: z.enum(['ok', 'missing', 'not_directory', 'denied', 'unreachable']),
  entries: z.array(directoryEntrySchema).max(MAX_DIRECTORY_LISTING_ENTRIES),
  truncated: z.boolean(),
});

const workerIdSchema = z.string().min(1).max(MAX_WORKER_ID_LENGTH);

/** The worker a request names: its token and MMT_WORKER_ID. */
export const targetCheckWorkerSchema = z.strictObject({
  tokenId: uuidSchema,
  workerId: workerIdSchema,
});

/** Without a chosen worker, any worker assigned to the target may claim the check. */
export const targetCheckRequestSchema = z.strictObject({
  worker: targetCheckWorkerSchema.optional(),
});

// Absolute, or under the home directory of the SSH user (~ or ~/...): what the shell expands.
const directoryPathSchema = reportedPathSchema.refine(
  (path) => path.startsWith('/') || path === '~' || path.startsWith('~/'),
  'Must be absolute or start with ~/',
);

export const directoryListingRequestSchema = z.strictObject({
  path: directoryPathSchema,
  worker: targetCheckWorkerSchema,
});

const uniqueValues = <T>(values: T[]) => new Set(values).size === values.length;

export const targetCheckClaimSchema = z.strictObject({
  workerId: workerIdSchema,
  // MMT_WORKER_TARGET_IDS; empty for a worker that takes only the requests assigned to it.
  targetIds: z
    .array(uuidSchema)
    .max(1000)
    .refine(uniqueValues, 'IDs must be unique')
    .default([]),
  kinds: z
    .array(z.enum(TARGET_CHECK_KINDS))
    .min(1)
    .refine(uniqueValues, 'Kinds must be unique'),
  // Requests the worker runs now; one it claimed but does not run is returned before a new one.
  activeCheckIds: z
    .array(uuidSchema)
    .max(MAX_ACTIVE_CHECKS_PER_WORKER)
    .refine(uniqueValues, 'IDs must be unique')
    .default([]),
});

export const targetCheckCompleteSchema = z.strictObject({
  leaseId: uuidSchema,
  status: z.enum(['finished', 'failed']),
  // Checked against the request's kind by the service.
  result: z.union([targetCheckResultSchema, directoryListingResultSchema]),
});

// API tokens (mmt_/mmtj_) and PEM blocks must never be stored.
const SECRET_PATTERNS = [/\bmmtj?_[A-Za-z0-9_-]{8,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

function connectionTexts(result: TargetCheckResult): string[] {
  const facts = [
    ...result.items.flatMap((item) => (item.detail === null ? [] : [item.detail])),
    ...(result.gpus ?? []).flatMap((gpu) => [gpu.uuid, gpu.name]),
  ];
  return [
    ...facts,
    ...[result.host.machine, result.host.homeDirectory].filter((value) => value !== null),
    ...result.pythons.map((python) => python.path),
    ...result.directories.map((directory) => directory.path),
  ];
}

function rejectSecretTexts(texts: string[], secretPaths: string[]): void {
  const leaks = texts.some(
    (value) =>
      SECRET_PATTERNS.some((pattern) => pattern.test(value)) ||
      secretPaths.some((path) => value.includes(path)),
  );
  if (leaks)
    throw new DomainError(
      422,
      '診断結果に鍵のパスや認証情報が含まれています',
      'target_check_secret_in_result',
    );
}

/** The target's own key files name the worker's credentials; a result must never carry them. */
export function rejectSecretsInResult(
  result: TargetCheckResult,
  target: { sshKeyPath: string; knownHostsPath: string },
): void {
  const secretPaths = [target.sshKeyPath, target.knownHostsPath].filter((path) => path !== '');
  rejectSecretTexts(connectionTexts(result), secretPaths);
}

/**
 * A listing names entries of the computer's directory, while the key paths name files on the
 * worker's host, so only tokens and PEM blocks are looked for.
 */
export function rejectSecretsInListing(result: TargetDirectoryListingResult): void {
  rejectSecretTexts([result.path, ...result.entries.map((entry) => entry.name)], []);
}

export function rejectOversizedResult(result: unknown, maxBytes: number): void {
  if (Buffer.byteLength(JSON.stringify(result)) > maxBytes)
    throw new DomainError(422, '診断結果が上限サイズを超えています', 'target_check_result_too_large');
}

export function isDirectoryListingResult(
  result: TargetCheckResult | TargetDirectoryListingResult,
): result is TargetDirectoryListingResult {
  return 'entries' in result;
}
