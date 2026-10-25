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

// 結果は短い要約で、これより大きい本体はworkerがコマンドの生の出力を送ったということ。
// version 2で候補の一覧（pythons、directories）が加わり、そのパスがこの大きさの大半を占める。
export const MAX_TARGET_CHECK_RESULT_BYTES = 32 * 1024;
// 一覧にはMAX_DIRECTORY_LISTING_ENTRIES個までの名前が入り、それぞれファイル名の長さまで。
export const MAX_DIRECTORY_LISTING_RESULT_BYTES = 64 * 1024;
// 1台のホストには十分な数（DGX級のマシンでGPUは8〜16個）。
const MAX_TARGET_CHECK_GPUS = 64;
// PATH上、/usr/bin、研究者のvenvとconda環境にあるPython。これより多くは読まない。
const MAX_TARGET_CHECK_PYTHONS = 20;
// ホーム、その中のディレクトリ、作業ディレクトリを置けるマウント。
const MAX_TARGET_CHECK_DIRECTORIES = 40;
// 入力しながらディレクトリを選ぶには足りる数。これより大きいディレクトリはtruncatedと印を付ける。
const MAX_DIRECTORY_LISTING_ENTRIES = 200;
// LinuxのファイルシステムのNAME_MAX。
const MAX_DIRECTORY_ENTRY_NAME_LENGTH = 255;
// バージョンの行やGPUのモデル名には足り、ログを丸ごと入れるには短い長さ。
const MAX_DETAIL_LENGTH = 200;
// workers（migration 019）とclaimのworker idに合わせる。
const MAX_WORKER_ID_LENGTH = 200;
// workerは同時に少数のリクエストを動かす（workerのMAX_PARALLEL_TARGET_CHECKS）。
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

/** リクエストが指すworker。そのtokenとMMT_WORKER_ID。 */
export const targetCheckWorkerSchema = z.strictObject({
  tokenId: uuidSchema,
  workerId: workerIdSchema,
});

/** workerを選ばなければ、そのコンピュータに割り当てたどのworkerでも検査をclaimできる。 */
export const targetCheckRequestSchema = z.strictObject({
  worker: targetCheckWorkerSchema.optional(),
});

// 絶対パスか、SSHユーザーのホームディレクトリの下（~または~/...）。シェルが展開する形。
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
  // MMT_WORKER_TARGET_IDS。自分に割り当てられたリクエストだけを受けるworkerでは空。
  targetIds: z
    .array(uuidSchema)
    .max(1000)
    .refine(uniqueValues, 'IDs must be unique')
    .default([]),
  kinds: z
    .array(z.enum(TARGET_CHECK_KINDS))
    .min(1)
    .refine(uniqueValues, 'Kinds must be unique'),
  // workerが今動かしているリクエスト。claimしたのに動かしていないものは、新しいものより先に返す。
  activeCheckIds: z
    .array(uuidSchema)
    .max(MAX_ACTIVE_CHECKS_PER_WORKER)
    .refine(uniqueValues, 'IDs must be unique')
    .default([]),
});

export const targetCheckCompleteSchema = z.strictObject({
  leaseId: uuidSchema,
  status: z.enum(['finished', 'failed']),
  // リクエストの種類との照合はサービスが行う。
  result: z.union([targetCheckResultSchema, directoryListingResultSchema]),
});

// API token（mado_mt_）・Job token（mado_mtj_）と PEM の秘密鍵は保存しない。
const SECRET_PATTERNS = [/\bmado_mtj?_[A-Za-z0-9_-]{8,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

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
    throw new DomainError({
      status: 422,
      code: 'target_check_secret_in_result',
      message: 'the check result contains key paths or credentials',
    });
}

/** コンピュータ自身の鍵ファイルはworkerの認証情報を指すので、結果に決して含めない。 */
export function rejectSecretsInResult(
  result: TargetCheckResult,
  target: { sshKeyPath: string; knownHostsPath: string },
): void {
  const secretPaths = [target.sshKeyPath, target.knownHostsPath].filter((path) => path !== '');
  rejectSecretTexts(connectionTexts(result), secretPaths);
}

/**
 * 一覧はコンピュータのディレクトリの項目を挙げ、鍵のパスはworkerのホストのファイルを指すので、
 * tokenとPEMのブロックだけを探す。
 */
export function rejectSecretsInListing(result: TargetDirectoryListingResult): void {
  rejectSecretTexts([result.path, ...result.entries.map((entry) => entry.name)], []);
}

export function rejectOversizedResult(result: unknown, maxBytes: number): void {
  if (Buffer.byteLength(JSON.stringify(result)) > maxBytes)
    throw new DomainError({
      status: 422,
      code: 'target_check_result_too_large',
      message: 'the check result exceeds the size limit',
    });
}

export function isDirectoryListingResult(
  result: TargetCheckResult | TargetDirectoryListingResult,
): result is TargetDirectoryListingResult {
  return 'entries' in result;
}
