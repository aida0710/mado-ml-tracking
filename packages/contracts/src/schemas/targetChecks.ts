import { z } from 'zod';
import {
  TARGET_CHECK_KINDS,
  type TargetCheck,
  type TargetCheckDirectory,
  type TargetCheckGpu,
  type TargetCheckHost,
  type TargetCheckItem,
  type TargetCheckPython,
  type TargetCheckResult,
  type TargetCheckWorker,
  type TargetCheckWorkerPresence,
  type TargetDirectoryEntry,
  type TargetDirectoryListing,
  type TargetDirectoryListingResult,
  type WorkerSshFiles,
  type WorkerTargetCheck,
} from '../targetChecks.js';
import { computeTargetSchema, cpuArchSchema, executionRuntimeKindSchema } from './execution.js';
import { idSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const targetCheckItemSchema = namedContractSchema(
  'TargetCheckItem',
  z.strictObject({
    name: z.enum([
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
    ]),
    status: z.enum(['ok', 'ng', 'unavailable', 'skipped']),
    code: z
      .enum([
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
      ])
      .nullable(),
    detail: z.string().nullable(),
  }),
);
export const targetCheckGpuSchema = namedContractSchema(
  'TargetCheckGpu',
  z.strictObject({
    index: z.string(),
    uuid: z.string(),
    name: z.string(),
    memoryTotalMiB: z.number().int(),
  }),
);
export const targetCheckHostSchema = namedContractSchema(
  'TargetCheckHost',
  z.strictObject({
    machine: z.string().nullable(),
    cpuArch: cpuArchSchema.nullable(),
    cpuCount: z.number().int().nullable(),
    memoryTotalBytes: z.number().int().nullable(),
    homeDirectory: z.string().nullable(),
  }),
);
export const targetCheckPythonSchema = namedContractSchema(
  'TargetCheckPython',
  z.strictObject({ path: z.string(), version: z.string().nullable() }),
);
export const targetCheckDirectorySchema = namedContractSchema(
  'TargetCheckDirectory',
  z.strictObject({
    path: z.string(),
    source: z.enum(['home', 'home_child', 'mount']),
    writable: z.boolean(),
    freeBytes: z.number().int().nullable(),
  }),
);
const targetCheckFactsShape = {
  items: z.array(targetCheckItemSchema),
  gpus: z.array(targetCheckGpuSchema).nullable(),
  runtimeKinds: z.array(executionRuntimeKindSchema),
  workDirectoryFreeBytes: z.number().int().nullable(),
};
export const targetCheckResultSchema = namedContractSchema(
  'TargetCheckResult',
  z.discriminatedUnion('version', [
    z.strictObject({ version: z.literal(1), ...targetCheckFactsShape }),
    z.strictObject({
      version: z.literal(2),
      ...targetCheckFactsShape,
      host: targetCheckHostSchema,
      pythons: z.array(targetCheckPythonSchema),
      directories: z.array(targetCheckDirectorySchema),
    }),
  ]),
);
export const targetCheckWorkerSchema = namedContractSchema(
  'TargetCheckWorker',
  z.strictObject({ tokenId: idSchema, workerId: z.string() }),
);
export const targetCheckSchema = namedContractSchema(
  'TargetCheck',
  z.strictObject({
    id: idSchema,
    targetId: idSchema,
    requestedBy: idSchema,
    status: z.enum(['queued', 'claimed', 'finished', 'failed']),
    workerId: z.string().nullable(),
    assignedWorker: targetCheckWorkerSchema.nullable(),
    result: targetCheckResultSchema.nullable(),
    failureReason: z.enum(['no_worker', 'claim_timeout']).nullable(),
    createdAt: timestampSchema,
    claimedAt: timestampSchema.nullable(),
    finishedAt: timestampSchema.nullable(),
  }),
);
export const targetDirectoryEntrySchema = namedContractSchema(
  'TargetDirectoryEntry',
  z.strictObject({
    name: z.string(),
    kind: z.enum(['directory', 'file']),
    executable: z.boolean(),
  }),
);
export const targetDirectoryListingResultSchema = namedContractSchema(
  'TargetDirectoryListingResult',
  z.strictObject({
    path: z.string(),
    outcome: z.enum(['ok', 'missing', 'not_directory', 'denied', 'unreachable']),
    entries: z.array(targetDirectoryEntrySchema),
    truncated: z.boolean(),
  }),
);
export const targetDirectoryListingSchema = namedContractSchema(
  'TargetDirectoryListing',
  z.strictObject({
    id: idSchema,
    targetId: idSchema,
    path: z.string(),
    assignedWorker: targetCheckWorkerSchema,
    status: z.enum(['queued', 'claimed', 'finished', 'failed']),
    workerId: z.string().nullable(),
    result: targetDirectoryListingResultSchema.nullable(),
    failureReason: z.enum(['no_worker', 'claim_timeout']).nullable(),
    createdAt: timestampSchema,
    finishedAt: timestampSchema.nullable(),
  }),
);
export const workerSshFilesSchema = namedContractSchema(
  'WorkerSshFiles',
  z.strictObject({ keyPaths: z.array(z.string()), knownHostsPaths: z.array(z.string()) }),
);
export const targetCheckWorkerPresenceSchema = namedContractSchema(
  'TargetCheckWorkerPresence',
  z.strictObject({
    tokenId: idSchema,
    tokenName: z.string(),
    projectId: idSchema,
    workerId: z.string(),
    hostname: z.string().nullable(),
    version: z.string().nullable(),
    lastSeenAt: timestampSchema,
    sshFiles: workerSshFilesSchema,
  }),
);
export const workerTargetCheckSchema = namedContractSchema(
  'WorkerTargetCheck',
  z.strictObject({
    check: targetCheckSchema,
    leaseId: idSchema,
    target: computeTargetSchema,
    kind: z.enum(TARGET_CHECK_KINDS),
    directoryPath: z.string().nullable(),
  }),
);

type _TargetCheckItem = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckItemSchema>, TargetCheckItem>
>;
type _TargetCheckGpu = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckGpuSchema>, TargetCheckGpu>
>;
type _TargetCheckHost = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckHostSchema>, TargetCheckHost>
>;
type _TargetCheckPython = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckPythonSchema>, TargetCheckPython>
>;
type _TargetCheckDirectory = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckDirectorySchema>, TargetCheckDirectory>
>;
type _TargetCheckResult = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckResultSchema>, TargetCheckResult>
>;
type _TargetCheckWorker = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckWorkerSchema>, TargetCheckWorker>
>;
type _TargetCheck = Expect<MutuallyAssignable<z.infer<typeof targetCheckSchema>, TargetCheck>>;
type _TargetDirectoryEntry = Expect<
  MutuallyAssignable<z.infer<typeof targetDirectoryEntrySchema>, TargetDirectoryEntry>
>;
type _TargetDirectoryListingResult = Expect<
  MutuallyAssignable<
    z.infer<typeof targetDirectoryListingResultSchema>,
    TargetDirectoryListingResult
  >
>;
type _TargetDirectoryListing = Expect<
  MutuallyAssignable<z.infer<typeof targetDirectoryListingSchema>, TargetDirectoryListing>
>;
type _WorkerSshFiles = Expect<
  MutuallyAssignable<z.infer<typeof workerSshFilesSchema>, WorkerSshFiles>
>;
type _TargetCheckWorkerPresence = Expect<
  MutuallyAssignable<z.infer<typeof targetCheckWorkerPresenceSchema>, TargetCheckWorkerPresence>
>;
type _WorkerTargetCheck = Expect<
  MutuallyAssignable<z.infer<typeof workerTargetCheckSchema>, WorkerTargetCheck>
>;
