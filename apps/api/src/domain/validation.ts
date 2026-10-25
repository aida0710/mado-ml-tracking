import { z } from 'zod';
import { isValidStorageBackendName } from '@mmt/platform';
import {
  containsControlCharacter,
  COMPUTE_TARGET_VISIBILITIES,
  CPU_ARCHES,
  DATASET_TRANSFER_MODES,
  DEFAULT_DATASET_CACHE_MAX_BYTES,
  DEFAULT_JOB_ATTEMPTS,
  MAX_JOB_ATTEMPTS,
  MAX_JOB_GPU_COUNT,
  MAX_JOB_WALLTIME_SECONDS,
  MAX_QUEUE_TIMEOUT_SECONDS,
  MIN_DATASET_CACHE_MAX_BYTES,
  MIN_QUEUE_TIMEOUT_SECONDS,
  SITE_SUBMISSION_MODES,
  TOKEN_SCOPES,
  WORKER_CAPABILITIES,
} from '@mmt/contracts';
import { workerCapabilitySchema } from '@mmt/contracts/schemas';
import { executionRuntimeSchema, runtimeKindSchema } from './runtimeValidation.js';
import { codeSourceSchema } from './codeSourceValidation.js';
import { reportedPathSchema } from './reportedPathValidation.js';
export { codeSourceSchema } from './codeSourceValidation.js';

export const uuidSchema = z.uuid();
export const nameSchema = z.string().trim().min(1).max(200);
export const jsonObjectSchema = z.record(z.string().max(200), z.json());
export const tagsSchema = z.record(z.string().min(1).max(200), z.string().max(4000));
export const runKindSchema = z.enum([
  'inference',
  'evaluation',
  'training',
  'finetuning',
  'processing',
]);
export const runStatusSchema = z.enum(['queued', 'running', 'finished', 'failed', 'canceled']);
export const roleSchema = z.enum(['viewer', 'editor', 'admin']);
export const roleAssignmentSchema = z.strictObject({ role: roleSchema });
// user_groups.group_name（migration 012）と同じ上限。名前はAuthentikからそのまま来る。
export const groupNameSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !containsControlCharacter(value), 'Control characters are not allowed');
// GET /usersのクエリ文字列。メールアドレス・ユーザー名・表示名の前方一致。
export const userSearchQuerySchema = z.object({ query: z.string().trim().min(1).max(200) });
// 環境変数の保存先（'filesystem'、's3'）か、管理者がstorage_backendsに保存した名前。
export const artifactBackendSchema = z.string().refine(isValidStorageBackendName);
export const scopeSchema = z.enum(TOKEN_SCOPES);
export const uniqueScopesSchema = z
  .array(scopeSchema)
  .min(1)
  .max(TOKEN_SCOPES.length)
  .refine((values) => new Set(values).size === values.length, 'Scopes must be unique');
export const uniqueIdsSchema = z
  .array(uuidSchema)
  .max(1000)
  .refine((values) => new Set(values).size === values.length, 'IDs must be unique');
// ルールやコードバージョンは、互換性のあるモデル系列を明示的に100個まで指定できる。
const MAX_MODEL_FAMILIES = 100;
export const modelFamiliesSchema = z
  .array(nameSchema)
  .min(1)
  .max(MAX_MODEL_FAMILIES)
  .refine((families) => new Set(families).size === families.length);

export function isRelativeFilePath(path: string): boolean {
  return (
    !!path &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.includes('\0') &&
    path.split('/').every((part) => !!part && part !== '.' && part !== '..')
  );
}
export const namedEntitySchema = z.strictObject({
  name: nameSchema,
  description: z.string().max(20000).default(''),
});
export const modelCreateSchema = namedEntitySchema.extend({ family: nameSchema });
export const datasetCreateSchema = namedEntitySchema.extend({
  namespace: nameSchema.default('local'),
});
// コマンドはシェルでなくargvを使う。workerに渡す前に引数の大きさを制限する。
const commandArgumentSchema = z
  .string()
  .min(1)
  .max(4000)
  .refine((value) => !value.includes('\0'));
const commandSchema = z.array(commandArgumentSchema).max(100);
export const executionModeSchema = z.enum(['run', 'test']);
export const codeVersionSchema = z
  .strictObject({
    version: nameSchema,
    source: codeSourceSchema.nullable().default(null),
    runtime: executionRuntimeSchema,
    entrypoint: commandSchema.min(1),
    testEntrypoint: commandSchema.default([]),
    requirements: z.array(z.string().min(1).max(2000)).max(1000).default([]),
    environment: z
      .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(10000))
      .default({}),
    supportedModelFamilies: modelFamiliesSchema,
    taskTypes: z
      .array(runKindSchema)
      .min(1)
      .max(5)
      .refine((values) => new Set(values).size === values.length),
  })
  .superRefine((code, context) => {
    if (code.runtime.kind === 'python' && code.source === null)
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Python requires a source',
      });
    if (code.runtime.kind !== 'python' && code.requirements.length)
      context.addIssue({
        code: 'custom',
        path: ['requirements'],
        message: 'Container requirements must be empty',
      });
  });
export const modelVersionSchema = z.strictObject({
  // 省略したバージョンにはAPIが番号を振る（registerModelVersion）。
  version: nameSchema.optional(),
  parentModelVersionIds: uniqueIdsSchema.default([]),
  sourceRunId: uuidSchema.nullish(),
  weightsUri: z.string().min(1).max(4000).nullish(),
  artifactId: uuidSchema.nullish(),
  defaultCodeVersionId: uuidSchema.nullish(),
  metadata: jsonObjectSchema.default({}),
});
export const externalDatasetRefSchema = z.strictObject({
  pluginId: uuidSchema,
  externalId: nameSchema,
  namespace: nameSchema,
  name: nameSchema,
  version: nameSchema,
});
export const datasetVersionSchema = z.strictObject({
  version: nameSchema,
  uri: z.string().min(1).max(4000),
  digest: z.string().min(1).max(1000),
  schema: jsonObjectSchema.default({}),
  metadata: jsonObjectSchema.default({}),
  sourceRunId: uuidSchema.nullish(),
  parentDatasetVersionIds: uniqueIdsSchema.default([]),
  externalRef: externalDatasetRefSchema.nullish(),
});
export const runCreateSchema = z.strictObject({
  experimentId: uuidSchema,
  name: nameSchema,
  kind: runKindSchema,
  parameters: jsonObjectSchema.default({}),
  tags: tagsSchema.default({}),
  modelVersionId: uuidSchema.nullish(),
  codeVersionId: uuidSchema.nullish(),
  executionMode: executionModeSchema.optional(),
  inputDatasetVersionIds: uniqueIdsSchema.default([]),
  parentRunId: uuidSchema.nullish(),
  environment: jsonObjectSchema.default({}),
  // 保存したcheckpointから続ける。作成時に固定する（checkpointServiceを参照）。
  resumeCheckpointId: uuidSchema.optional(),
});
export const runPatchSchema = z.strictObject({
  name: nameSchema.optional(),
  parameters: jsonObjectSchema.optional(),
  tags: tagsSchema.optional(),
  status: runStatusSchema.optional(),
  environment: jsonObjectSchema.optional(),
});
export const metricSchema = z.strictObject({
  name: nameSchema,
  value: z.number(),
  step: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  timestamp: z.iso.datetime({ offset: true }),
});
export const logSchema = z.strictObject({
  timestamp: z.iso.datetime({ offset: true }),
  level: z.enum(['info', 'warning', 'error']),
  message: z.string().max(200000),
});
// SDKのアップロードに応えつつ書き込みのトランザクションを短く保つため、バッチの大きさを制限する。
export const metricBatchSchema = z.strictObject({
  metrics: z.array(metricSchema).min(1).max(1000),
});
export const logBatchSchema = z.strictObject({
  entries: z.array(logSchema).min(1).max(1000),
});
export const gpuIdsSchema = z
  .array(z.string().min(1).max(100))
  .max(128)
  .refine((values) => new Set(values).size === values.length);
export const maxAttemptsSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_JOB_ATTEMPTS)
  .default(DEFAULT_JOB_ATTEMPTS);
export const walltimeSecondsSchema = z.number().int().min(1).max(MAX_JOB_WALLTIME_SECONDS);
export const gpuCountSchema = z.number().int().min(0).max(MAX_JOB_GPU_COUNT);
// 接続設定はsshとlocalのコンピュータ用。siteでは空のままにし、executorごとにどれが要るかは
// validateTargetConfigurationが検査する。
export const targetSchema = z.strictObject({
  name: nameSchema,
  host: z
    .string()
    .max(253)
    .refine((value) => !value.startsWith('-') && !/[\s\0]/.test(value)),
  port: z.number().int().min(1).max(65535),
  username: z.string().regex(/^(?:[a-zA-Z_][a-zA-Z0-9_.-]*)?$/),
  sshKeyPath: z.string().max(4000),
  knownHostsPath: z.string().max(4000),
  workDirectory: z.string().max(4000),
  pythonExecutable: z.string().max(4000),
  runtimeKinds: z
    .array(runtimeKindSchema)
    .min(1)
    .max(runtimeKindSchema.options.length)
    .refine((values) => new Set(values).size === values.length),
  gpuIds: gpuIdsSchema,
  maxConcurrentJobs: z.number().int().min(1).max(128),
  enabled: z.boolean(),
  executor: z.enum(['ssh', 'local', 'site']),
  datasetCacheMaxBytes: z
    .number()
    .int()
    .min(MIN_DATASET_CACHE_MAX_BYTES)
    .max(Number.MAX_SAFE_INTEGER)
    .default(DEFAULT_DATASET_CACHE_MAX_BYTES),
  // 省略時: sshとlocalはrelay、siteはdirect（runnerがJob tokenでダウンロードする）。
  datasetTransfer: z.enum(DATASET_TRANSFER_MODES).optional(),
  submissionMode: z.enum(SITE_SUBMISSION_MODES).default('automatic'),
  cpuArch: z.enum(CPU_ARCHES).default('amd64'),
  supportsArray: z.boolean().default(false),
  queueTimeoutSeconds: z
    .number()
    .int()
    .min(MIN_QUEUE_TIMEOUT_SECONDS)
    .max(MAX_QUEUE_TIMEOUT_SECONDS)
    .nullable()
    .default(null),
  // 選ばなければprivate。新しいコンピュータは、所有者が全員に開くまで所有者だけが使う。
  visibility: z.enum(COMPUTE_TARGET_VISIBILITIES).default('private'),
});
export const jobListQuerySchema = z.strictObject({ runId: uuidSchema.optional() });
// gpuCount・retryOnFailure・retryOnTimeoutはsiteのJob用（validateSiteJobOptions）。
export const jobCreateSchema = z.strictObject({
  runId: uuidSchema,
  targetId: uuidSchema,
  gpuIds: gpuIdsSchema.default([]),
  gpuCount: gpuCountSchema.default(0),
  walltimeSeconds: walltimeSecondsSchema.nullable().default(null),
  maxAttempts: maxAttemptsSchema,
  retryOnFailure: z.boolean().default(false),
  retryOnTimeout: z.boolean().default(false),
  allowChildJobs: z.boolean().default(false),
});
// RunとそのJobを1つのリクエストで作り、Jobが断られたときにキュー待ちのRunが残らないようにする。
export const jobLaunchSchema = z.strictObject({
  run: runCreateSchema,
  job: jobCreateSchema.omit({ runId: true }),
});
export const targetPatchSchema = targetSchema.partial().extend({
  runtimeKinds: targetSchema.shape.runtimeKinds.optional(),
  datasetCacheMaxBytes: targetSchema.shape.datasetCacheMaxBytes.removeDefault().optional(),
  submissionMode: targetSchema.shape.submissionMode.removeDefault().optional(),
  cpuArch: targetSchema.shape.cpuArch.removeDefault().optional(),
  supportsArray: targetSchema.shape.supportsArray.removeDefault().optional(),
  queueTimeoutSeconds: targetSchema.shape.queueTimeoutSeconds.removeDefault().optional(),
  visibility: targetSchema.shape.visibility.removeDefault().optional(),
});
export const tokenCreateSchema = z.strictObject({
  name: nameSchema,
  projectId: uuidSchema.nullish(),
  scopes: uniqueScopesSchema,
  expiresAt: z.iso.datetime({ offset: true }).nullish()
    .describe('未来の日時。nullは無期限。省略時は設定された既定の日数（既定365日）。'),
});
export { pluginCreateSchema, pluginPatchSchema } from './pluginValidation.js';
import { pluginPatchSchema } from './pluginValidation.js';
export const pluginDatasetSchema = z.strictObject({
  externalId: nameSchema,
  namespace: nameSchema,
  name: nameSchema,
  version: nameSchema,
  uri: z.string().min(1).max(4000),
  digest: z.string().min(1).max(1000),
  schema: jsonObjectSchema,
  metadata: jsonObjectSchema,
});
// workerが報告する並列のJob数はこれが上限。これより大きい値は設定の誤り。
const MAX_WORKER_PARALLEL_JOBS = 1000;
// workerのホストの~/.sshにこれより多いことはまず無い。候補として出すだけ。
export const MAX_WORKER_SSH_FILE_PATHS = 50;
// workerは持っているcapabilityをそれぞれ1回ずつ挙げる。
const MAX_WORKER_CAPABILITIES = WORKER_CAPABILITIES.length;
/**
 * Jobを動かすコードが基本のプロトコルを超えてJobに渡すもの。workerはworkerInfoで、launcherや
 * `mado-tracking submit`はsiteのclaimで（自分が入れるrunnerの分を）挙げる。それを要するJobは、
 * それを挙げたclaimにだけ渡る。
 */
export const workerCapabilitiesSchema = z
  .array(workerCapabilitySchema)
  .max(MAX_WORKER_CAPABILITIES)
  .refine((names) => new Set(names).size === names.length, 'capabilities must be unique');
// workerのホストが自分で報告するもので、認可には使わない。sshFilesはworkerのホスト上のパスで、
// ファイルの中身ではない。コンピュータの鍵のパスの候補として出す。
export const workerInfoSchema = z.strictObject({
  version: z.string().trim().min(1).max(200),
  hostname: z.string().trim().min(1).max(255),
  parallelJobs: z.number().int().min(1).max(MAX_WORKER_PARALLEL_JOBS),
  sshFiles: z
    .strictObject({
      keyPaths: z.array(reportedPathSchema).max(MAX_WORKER_SSH_FILE_PATHS),
      knownHostsPaths: z.array(reportedPathSchema).max(MAX_WORKER_SSH_FILE_PATHS),
    }),
  capabilities: workerCapabilitiesSchema,
});
export const workerResumeSchema = z.strictObject({
  workerId: z.string().min(1).max(200),
  targetIds: uniqueIdsSchema.optional(),
  workerInfo: workerInfoSchema,
});
export const workerClaimSchema = workerResumeSchema.extend({
  activeJobIds: uniqueIdsSchema.optional(),
});
export const heartbeatSchema = z.strictObject({
  leaseId: uuidSchema,
  status: z.literal('running').optional(),
});
export const workerMetricSchema = metricBatchSchema.extend({ leaseId: uuidSchema });
export const workerLogSchema = logBatchSchema.extend({ leaseId: uuidSchema });
export const completeSchema = z.strictObject({
  leaseId: uuidSchema,
  status: z.enum(['finished', 'failed', 'canceled']),
  exitCode: z.number().int().optional(),
  error: z.string().max(20000).optional(),
});

export type RunCreate = z.infer<typeof runCreateSchema>;
export type RunPatch = z.infer<typeof runPatchSchema>;
export type CodeVersionCreate = z.infer<typeof codeVersionSchema>;
export type ModelVersionCreate = z.infer<typeof modelVersionSchema>;
export type DatasetVersionCreate = z.infer<typeof datasetVersionSchema>;
export type JobCreate = z.infer<typeof jobCreateSchema>;
export type JobLaunch = z.infer<typeof jobLaunchSchema>;
export type TargetCreate = z.infer<typeof targetSchema>;
export type TargetPatch = z.infer<typeof targetPatchSchema>;
export type PluginPatch = z.infer<typeof pluginPatchSchema>;
