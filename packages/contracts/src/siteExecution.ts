import type { ComputeTarget, Job, JsonObject, LogEntry, MetricPoint, RunKind, WorkerJob } from './index.js';
import type { SiteJobShell, SiteSettings, SiteSubmissionAccount } from './siteComputers.js';
import type { WorkerOutputDeclaration } from './workerOutputs.js';

/**
 * site（ComputeTarget.executor='site'）は、launcherが投入するコンピュータ、またはログインに
 * ワンタイムパスワードが要るため依頼者が`mado-tracking submit`で投入するコンピュータ。設定と
 * job shellはWebの画面で編集し（siteComputers.ts）、計算ノードのrunnerがJob tokenで報告を
 * 返す（docs/sites.md）。
 */
export type SiteSubmissionMode = 'automatic' | 'manual';
export const SITE_SUBMISSION_MODES: readonly SiteSubmissionMode[] = ['automatic', 'manual'];

/** siteの計算ノードのCPU。コンテナイメージとSIFはこれに合わせてビルドする必要がある。 */
export type CpuArch = 'amd64' | 'arm64';
export const CPU_ARCHES: readonly CpuArch[] = ['amd64', 'arm64'];

/**
 * siteのJobが、queuedから終わるまでのどこにいるか:
 * waiting_manual（queued。依頼者が手で投入する）、submitting（投入のためにclaimされた）、
 * submitted（スケジューラのキューにいる）、waiting_resources（runnerが入力を用意し、空いた
 * GPUを待つ）、running（コンテナが動いている）。sshとlocalのJobにはphaseが無い。
 */
export type JobPhase =
  | 'waiting_manual'
  | 'submitting'
  | 'submitted'
  | 'waiting_resources'
  | 'running';
export const JOB_PHASES: readonly JobPhase[] = [
  'waiting_manual',
  'submitting',
  'submitted',
  'waiting_resources',
  'running',
];

/**
 * launcherか依頼者がsiteのJobを持ち、まだrunnerが報告していないphase。投入中か、スケジューラの
 * キューで待っている。何も動いていないので、止めるとすぐに終わる。
 */
export const JOB_SUBMISSION_PHASES: readonly JobPhase[] = ['submitting', 'submitted'];

/**
 * siteのJobが終わった、statusより詳しい理由。スケジューラが時間の上限で止めた（timed_out）、
 * siteが許すより長くキューで待った（queue_timeout）、job shellが拒んだ（submit_failed）の
 * どれか。
 */
export type JobEndReason = 'timed_out' | 'queue_timeout' | 'submit_failed';
export const JOB_END_REASONS: readonly JobEndReason[] = ['timed_out', 'queue_timeout', 'submit_failed'];

/** 1つのarrayのメンバー数。各インデックスがそれぞれのRunとJobになる。 */
export const MAX_JOB_ARRAY_SIZE = 10000;
/** 1つのJobが要求できるGPUの数。jobs.gpu_countのDBでの上限でもある。 */
export const MAX_JOB_GPU_COUNT = 64;
/** Jobが要求できる最長の時間の上限（30日）。siteのjob shellはこれより短くしてもよい。 */
export const MAX_JOB_WALLTIME_SECONDS = 30 * 24 * 60 * 60;
/** 1回のclaimが返すsubmissionの数。arrayは1つのsubmissionと数える。 */
export const SITE_CLAIM_MAX_SUBMISSIONS = 50;
/** claimされたあと、この時間報告が無いsubmissionはsubmit_failedとして失敗にする。 */
export const SITE_SUBMISSION_REPORT_TIMEOUT_SECONDS = 15 * 60;
/**
 * ComputeTarget.queueTimeoutSecondsの範囲。これより短いと、スケジューラが報告する前にJobが
 * 失敗してしまう。最長はMAX_JOB_WALLTIME_SECONDSに合わせる。
 */
export const MIN_QUEUE_TIMEOUT_SECONDS = 60;
export const MAX_QUEUE_TIMEOUT_SECONDS = 30 * 24 * 60 * 60;

export interface JobArrayGroup {
  id: string;
  projectId: string;
  targetId: string;
  size: number;
  createdBy: string;
  parentJobId: string | null;
  hookId: string | null;
  /** すべてのメンバーが終了状態の試行を持ち、始める再試行が残っていないときに入る。 */
  finishedAt: string | null;
  createdAt: string;
}

/** POST /projects/:p/job-arrays: インデックスごとに1つのRunとJobを作り、まとめてsiteに投入する。 */
export interface JobArrayCreate {
  experimentId: string;
  name: string;
  kind: RunKind;
  codeVersionId: string;
  modelVersionId?: string | null;
  inputDatasetVersionIds?: string[];
  parameters?: JsonObject;
  tags?: Record<string, string>;
  targetId: string;
  gpuCount?: number;
  walltimeSeconds?: number | null;
  size: number;
  maxAttempts?: number;
  retryOnFailure?: boolean;
  retryOnTimeout?: boolean;
  allowChildJobs?: boolean;
  /** ファイルをメンバーに分ける'artifacts'の入力のバージョン（docs/sites.md）。 */
  datasetPartitionVersionId?: string | null;
}

export interface JobArrayCreated {
  arrayGroup: JobArrayGroup;
  jobs: Job[];
}

/** 誰のためのsubmissionか。本人のアカウントで動くsiteでは、launcherがその人のアカウントを選ぶ。 */
export interface SiteSubmissionRequester {
  id: string;
  email: string;
  username: string | null;
}

/** job shellの1回の呼び出し。1つのJob、またはarrayを受け付けるsiteではarrayの全メンバー。 */
export interface SiteSubmission {
  target: ComputeTarget;
  arrayGroupId: string | null;
  requester: SiteSubmissionRequester;
  jobs: WorkerJob[];
  /** claimした時点のsiteの設定。 */
  settings: SiteSettings;
  /** Jobが記録したjob shellのバージョン（Job.siteJobShellId）。 */
  jobShell: SiteJobShell;
  account: SiteSubmissionAccount;
}

/** launcherのtokenで呼ぶPOST /launcher/site-submissions/claim。そのlauncherのsiteだけ。 */
export interface SiteSubmissionClaim {
  targetIds?: string[];
  limit?: number;
}

/**
 * 自分のAPI tokenで呼ぶPOST /manual-submissions/claim。`all`は、自分が所有するコンピュータ
 * （`mado-tracking submit --watch`で待つPC）の待っているJobを、自分のもの以外もすべて取る。
 */
export interface ManualSubmissionClaim {
  targetId: string;
  submitterId: string;
  limit?: number;
  all?: boolean;
}

export interface SiteSubmissionResult {
  jobIds: string[];
  outcome: 'submitted' | 'failed';
  /** job shellが出力したスケジューラのジョブID。スケジューラの無い直接のホストではnull。 */
  schedulerJobId?: string | null;
  error?: string | null;
}

export interface SiteSubmissionReport {
  results: SiteSubmissionResult[];
}

export interface ManualSubmissionReport {
  submitterId: string;
  results: SiteSubmissionResult[];
}

/** GET /manual-submissions: `mado-tracking submit`を待っている依頼者のJob（siteごと）。 */
export interface ManualSubmissionWaiting {
  targetId: string;
  targetName: string;
  waitingJobs: number;
  /** 自分が所有するコンピュータで待つJobすべて（`--all`がclaimするもの）。ほかのsiteではnull。 */
  allWaitingJobs: number | null;
}

/** スケジューラのキューで待っている間に取り消されたJob。launcherが取り消しのコマンドを実行する。 */
export interface SiteSchedulerCancellation {
  jobId: string;
  targetId: string;
  schedulerJobId: string;
  /** それをキューに入れたアカウント。取り消しのコマンドはこのアカウントで実行する必要がある。 */
  account: SiteSubmissionAccount;
}

export interface SiteSchedulerCancellationReport {
  jobIds: string[];
}

/** Job tokenで呼ぶrunnerのプロトコル（POST /projects/:p/jobs/:j/runner/*）。 */
export type RunnerPhase = 'waiting_resources' | 'running';

export interface RunnerStart {
  /** runnerが1回だけ決める。同じJobの別のrunnerは拒否する（runner_conflict）。 */
  instanceId: string;
  host: string;
  gpuIds: string[];
  phase: RunnerPhase;
}

export interface RunnerHeartbeat {
  instanceId: string;
  phase?: RunnerPhase;
  gpuIds?: string[];
}

export interface RunnerState {
  job: Job;
  cancelRequested: boolean;
}

export interface RunnerLogs {
  instanceId: string;
  entries: LogEntry[];
}

export interface RunnerMetrics {
  instanceId: string;
  metrics: MetricPoint[];
}

export interface RunnerOutputs {
  version: 2;
  instanceId: string;
  declarations: WorkerOutputDeclaration[];
}

export interface RunnerFinish {
  instanceId: string;
  status: 'finished' | 'failed' | 'canceled';
  exitCode?: number;
  error?: string;
  /** timed_out: スケジューラの終了シグナルが届いた（時間の上限）。 */
  endReason?: 'timed_out';
}

export interface RunnerFinishResult {
  job: Job;
  /** この終了が始めた自動の再試行（retryOnFailure / retryOnTimeout）。無ければnull。 */
  retryJobId: string | null;
}
