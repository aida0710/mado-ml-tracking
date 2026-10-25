import type { Job, JobStatus, JsonObject, RunKind } from './index.js';
import type { UserKind } from './adminUsers.js';

/**
 * フックは、Projectで何かが起きたときにJobを始める（docs/hooks.md）。モデルの自動実行ルールを
 * 一般化したもので、トリガーもコンピュータも自由に選べ、Jobはフックの所有者として動く。
 */
export type HookTrigger =
  | 'manual'
  | 'model_registered'
  | 'run_finished'
  | 'array_finished'
  | 'checkpoint_saved'
  | 'webhook';
export const HOOK_TRIGGERS: readonly HookTrigger[] = [
  'manual',
  'model_registered',
  'run_finished',
  'array_finished',
  'checkpoint_saved',
  'webhook',
];

/**
 * 1つのRunで保存されたcheckpointのうち、どれがフックを始めるか。すべて（every）、k個ごと
 * （every_k）、前のものを評価している間は最新のものだけ（latest）、実行中は何も始めない
 * （skip_if_running）。
 */
export type HookCheckpointMode = 'every' | 'every_k' | 'latest' | 'skip_if_running';
export const HOOK_CHECKPOINT_MODES: readonly HookCheckpointMode[] = [
  'every',
  'every_k',
  'latest',
  'skip_if_running',
];

/** checkpointMode 'every_k'のkの上限。hooks.checkpoint_everyのデータベースでの上限でもある。 */
export const MAX_HOOK_CHECKPOINT_EVERY = 100000;

/** queue: すべてのイベントで始める。skip_if_running: フックのJobが終わっていない間は飛ばす。 */
export type HookConcurrency = 'queue' | 'skip_if_running';
export const HOOK_CONCURRENCY_MODES: readonly HookConcurrency[] = ['queue', 'skip_if_running'];

/** github: X-Hub-Signature-256とX-GitHub-Delivery。mmt: X-MMT-SignatureとX-MMT-Delivery。 */
export type HookWebhookSignature = 'github' | 'mmt';
export const HOOK_WEBHOOK_SIGNATURES: readonly HookWebhookSignature[] = ['github', 'mmt'];

/** フックとドライバーのJobの1つの連鎖の段数の上限。それより深い開始は飛ばす（chain_too_deep）。 */
export const MAX_JOB_CHAIN_DEPTH = 10;
export const DEFAULT_HOOK_MAX_STARTS_PER_HOUR = 60;
export const MAX_HOOK_MAX_STARTS_PER_HOUR = 10000;
/** webhookの本文か、手動のトリガーのpayload。Jobにはtrigger-payload.jsonとして届く。 */
export const HOOK_PAYLOAD_MAX_BYTES = 256 * 1024;
/** 学習のRunが終わっていないバージョンは、この時間だけ待ってから飛ばす。 */
export const HOOK_PENDING_MAX_AGE_HOURS = 7 * 24;
/** mmtの署名のタイムスタンプは、サーバーの時計とこれだけずれてもよい。 */
export const HOOK_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/** filterに合わないイベントはフックを始めず、実行の記録も残さない。 */
export interface HookFilter {
  modelFamilies?: string[];
  experimentIds?: string[];
  runKinds?: RunKind[];
  runStatuses?: ('finished' | 'failed' | 'canceled')[];
  tags?: Record<string, string>;
}

/**
 * トリガーごとに、イベントを絞り込める条件。ほかの条件を持つフックは決して一致しないので、
 * 作成時に拒む。モデルの登録はその学習のRun（終了状態はまだ無い）、checkpointはまだ学習中の
 * Run、arrayは先頭の要素と全要素の状態で表す。手動とwebhookによる開始は絞り込まない。
 */
export const HOOK_FILTER_FIELDS: Readonly<Record<HookTrigger, readonly (keyof HookFilter)[]>> = {
  manual: [],
  webhook: [],
  model_registered: ['modelFamilies', 'experimentIds', 'runKinds', 'tags'],
  run_finished: ['modelFamilies', 'experimentIds', 'runKinds', 'runStatuses', 'tags'],
  array_finished: ['modelFamilies', 'experimentIds', 'runKinds', 'runStatuses', 'tags'],
  checkpoint_saved: ['modelFamilies', 'experimentIds', 'runKinds', 'tags'],
};

/** webhookのフックが配信を受ける場所（認証なしのPOSTで、署名で確かめる）。 */
export function hookWebhookPath(hookId: string): string {
  return `/api/hooks/${encodeURIComponent(hookId)}/webhook`;
}

/** 1回の開始で作るもの。ssh・localのコンピュータはgpuIds、siteはgpuCountを受け取る。 */
export interface HookJobTemplate {
  experimentId: string;
  kind: RunKind;
  codeVersionId: string;
  /** 固定のバージョン。model_registeredでは代わりに登録されたバージョンを使う。 */
  modelVersionId: string | null;
  /** きっかけになったRunのモデルバージョンを使う（run_finished、checkpoint_saved）。 */
  inheritModelVersion: boolean;
  inputDatasetVersionIds: string[];
  /** きっかけになったRunの出力のDatasetVersionを入力に足す（上流の出力として印を付ける）。 */
  inheritOutputDatasets: boolean;
  parameters: JsonObject;
  tags: Record<string, string>;
  targetId: string;
  gpuIds: string[];
  gpuCount: number;
  walltimeSeconds: number | null;
  /** nullならJobを1つ始め、数ならその大きさのarrayを始める（siteだけ）。 */
  arraySize: number | null;
  datasetPartitionVersionId: string | null;
  maxAttempts: number;
  retryOnFailure: boolean;
  retryOnTimeout: boolean;
  allowChildJobs: boolean;
}

export type HookJobTemplateInput = Partial<
  Omit<HookJobTemplate, 'experimentId' | 'kind' | 'codeVersionId' | 'targetId'>
> &
  Pick<HookJobTemplate, 'experimentId' | 'kind' | 'codeVersionId' | 'targetId'>;

export interface Hook {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: HookTrigger;
  filter: HookFilter;
  template: HookJobTemplate;
  checkpointMode: HookCheckpointMode;
  /** every_kのk。それ以外ではnull。 */
  checkpointEvery: number | null;
  concurrency: HookConcurrency;
  maxStartsPerHour: number;
  webhookSignature: HookWebhookSignature | null;
  createdBy: string;
  runAsUserId: string;
  runAsKind?: Exclude<UserKind, 'launcher'>;
  runAsName?: string;
  createdByName: string;
  createdAt: string;
}

export interface HookCreate {
  name: string;
  trigger: HookTrigger;
  filter?: HookFilter;
  template: HookJobTemplateInput;
  checkpointMode?: HookCheckpointMode;
  checkpointEvery?: number | null;
  concurrency?: HookConcurrency;
  maxStartsPerHour?: number;
  /** トリガーが'webhook'のときは必須。 */
  webhookSignature?: HookWebhookSignature;
}

/** webhookのシークレットは作成時に1回だけ見せる。サーバーは暗号化して持つ。 */
export interface HookCreated {
  hook: Hook;
  webhookSecret: string | null;
  webhookPath: string | null;
}

export interface HookToggle {
  enabled: boolean;
}

/**
 * PUT /projects/:p/hooks/:id/owner（Project admin）: 以後、フックはこのService Accountとして
 * 動き、作成者が抜けたあとも始まり続ける。Service Accountは有効なeditorかadminでなければならない。
 */
export interface HookOwnerTransfer {
  serviceAccountId: string;
}

/**
 * POST /projects/:p/hooks/:id/trigger（トリガーが'manual'）。同じキーで送り直すと、その開始を
 * 返す。
 */
export interface HookTriggerRequest {
  payload?: JsonObject;
  idempotencyKey?: string;
}

export type HookExecutionStatus = 'pending' | 'queued' | 'skipped' | 'failed';
export type HookExecutionSubject =
  | 'manual'
  | 'model_version'
  | 'run'
  | 'array_group'
  | 'checkpoint'
  | 'webhook';
export type HookSkipReason =
  | 'loop_detected'
  | 'chain_too_deep'
  | 'rate_limited'
  | 'already_running'
  | 'owner_access_revoked'
  | 'superseded'
  | 'source_run_unsuccessful'
  | 'source_run_timeout'
  | 'hook_disabled';
export const HOOK_SKIP_REASONS: readonly HookSkipReason[] = [
  'loop_detected',
  'chain_too_deep',
  'rate_limited',
  'already_running',
  'owner_access_revoked',
  'superseded',
  'source_run_unsuccessful',
  'source_run_timeout',
  'hook_disabled',
];

export interface HookExecution {
  id: string;
  projectId: string;
  hookId: string;
  status: HookExecutionStatus;
  subjectKind: HookExecutionSubject;
  subjectId: string | null;
  reason: HookSkipReason | null;
  error: string | null;
  jobId: string | null;
  arrayGroupId: string | null;
  runId: string | null;
  /** 保留中の実行が待っているRun。 */
  waitingRunId: string | null;
  checkpointId: string | null;
  requestedBy: string | null;
  jobStatus: JobStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface HookExecutionPage {
  items: HookExecution[];
  nextCursor: string | null;
}

/** ドライバーのJob: :jのJob tokenでPOST /projects/:p/jobs/:j/childrenを呼ぶ。 */
export const MAX_CHILD_JOBS_PER_PARENT = 10000;
export const MAX_ACTIVE_CHILD_JOBS = 2000;
export const CHILD_JOB_WAIT_MAX_SECONDS = 60;

export interface ChildJobCreate {
  /** 同じキーで送り直すと、そのキーで作ったJobを返す（ドライバーが再起動したあとも）。 */
  idempotencyKey: string;
  experimentId?: string;
  name: string;
  kind: RunKind;
  codeVersionId: string;
  modelVersionId?: string | null;
  inputDatasetVersionIds?: string[];
  parameters?: JsonObject;
  tags?: Record<string, string>;
  targetId: string;
  gpuIds?: string[];
  gpuCount?: number;
  walltimeSeconds?: number | null;
  arraySize?: number | null;
  datasetPartitionVersionId?: string | null;
  maxAttempts?: number;
  retryOnFailure?: boolean;
  retryOnTimeout?: boolean;
  allowChildJobs?: boolean;
}

export interface ChildJobCreated {
  /** キーが使用済みならfalse。応答は最初のリクエストが作ったもの。 */
  created: boolean;
  arrayGroupId: string | null;
  jobs: Job[];
}

export interface JobStatusCounts {
  queued: number;
  claimed: number;
  running: number;
  finished: number;
  failed: number;
  canceled: number;
  total: number;
}

/** GET /projects/:p/jobs/:j/children/wait: すべての子が終わるか、待ち時間が尽きたら返る。 */
export interface ChildJobWait {
  done: boolean;
  counts: JobStatusCounts;
}
