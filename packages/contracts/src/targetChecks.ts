import type { ExecutionRuntimeKind } from './executionRuntime.js';
import type { ComputeTarget } from './index.js';
import type { CpuArch } from './siteExecution.js';

// workerが画面のために、自分のSSH鍵でComputeTarget上で行うこと。接続確認か、コンピュータの
// 設定中に1つのディレクトリを読むこと。APIはコンピュータに接続せず、リクエストをキューに入れて
// 結果を保存するだけ。
export type TargetCheckKind = 'connection' | 'directory_listing';
export const TARGET_CHECK_KINDS: readonly TargetCheckKind[] = ['connection', 'directory_listing'];

export type TargetCheckStatus = 'queued' | 'claimed' | 'finished' | 'failed';

// workerからの結果なしに確認が終わった理由。
// no_worker: そのコンピュータを担当するworker（または選ばれたworker）が時間内にclaimしなかった。
// claim_timeout: claimしたworkerが時間内に報告しなかった。
export type TargetCheckFailureReason = 'no_worker' | 'claim_timeout';

/** APIが保持するworker（WorkerPresence）: そのworker tokenとMMT_WORKER_ID。 */
export interface TargetCheckWorker {
  tokenId: string;
  workerId: string;
}

/**
 * POST /targets/:id/checks。`worker`を指定すると、そのworkerのMMT_WORKER_TARGET_IDSがコンピュータ
 * を挙げているかどうかにかかわらず、そのworkerだけが確認をclaimする（追加中のコンピュータは
 * どのworkerの設定にも無い）。指定しなければ、従来どおりMMT_WORKER_TARGET_IDSがコンピュータを
 * 挙げているworkerがclaimする。
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

// ngはその項目を必要とするJobにとっての問題。unavailableは、その項目が任意（Pythonだけの
// コンピュータでのdockerなど）で、見つからなかったことを表す。
export type TargetCheckItemStatus = 'ok' | 'ng' | 'unavailable' | 'skipped';

// ng/unavailable/skippedの機械可読な理由。Webの画面はコードごとに直し方のヒントを出す。
// work_directory_not_set: コンピュータにまだ作業ディレクトリが無い（設定中はskipped）。
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
  // バージョン文字列のような短い事実。鍵のパス、token、コマンドの出力をそのまま入れることはない。
  detail: string | null;
}

// `nvidia-smi --query-gpu=index,uuid,name,memory.total`の1行。
export interface TargetCheckGpu {
  index: string;
  uuid: string;
  name: string;
  memoryTotalMiB: number;
}

/** workerが到達したマシン。マシン自身が報告したとおりの値で、報告しなかったものはnull。 */
export interface TargetCheckHost {
  /** `uname -m`。x86_64やaarch64など。 */
  machine: string | null;
  /** `machine`をCpuArchにしたもの。契約が知らない値ならnull。 */
  cpuArch: CpuArch | null;
  cpuCount: number | null;
  memoryTotalBytes: number | null;
  homeDirectory: string | null;
}

/** コンピュータで見つかったPythonのインタープリタ（PATH上、/usr/bin、venvやconda環境の中）。 */
export interface TargetCheckPython {
  path: string;
  /** "3.11.9"など。インタープリタが応答しなかったときはnull。 */
  version: string | null;
}

/** ディレクトリの候補が見つかった場所。 */
export type TargetCheckDirectorySource = 'home' | 'home_child' | 'mount';

/** 作業ディレクトリを置けるディレクトリ。ホーム、その中のディレクトリ、またはマウント。 */
export interface TargetCheckDirectory {
  path: string;
  source: TargetCheckDirectorySource;
  writable: boolean;
  freeBytes: number | null;
}

interface TargetCheckFacts {
  items: TargetCheckItem[];
  // nvidia-smiが使えなければnull。GPUの値は、nvidia-smiが報告したものだけ。
  gpus: TargetCheckGpu[] | null;
  // 確認に通ったランタイムの種類。候補として出すだけで、自動では適用しない。
  runtimeKinds: ExecutionRuntimeKind[];
  workDirectoryFreeBytes: number | null;
}

/**
 * バージョン2は、コンピュータの設定に入れる値の出どころを加える。マシン、そのPython、作業
 * ディレクトリを置けるディレクトリ。候補は出すだけで、適用はしない。
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
  /** 確認をclaimしたworker。 */
  workerId: string | null;
  /** 依頼者が選んだworker。コンピュータを担当するどのworkerでもclaimしてよいときはnull。 */
  assignedWorker: TargetCheckWorker | null;
  result: TargetCheckResult | null;
  failureReason: TargetCheckFailureReason | null;
  createdAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
}

// 人がコンピュータについて入力するパス（読むディレクトリ）と、workerが報告するパス。
export const MAX_TARGET_PATH_LENGTH = 1024;

/** POST /targets/:id/directory-listings: `worker`を通してコンピュータの1つのディレクトリを読む。 */
export interface TargetDirectoryListingRequest {
  /** 絶対パス、またはSSHユーザーのホームディレクトリを指す~で始まるパス。 */
  path: string;
  worker: TargetCheckWorker;
}

// ok: 一覧を取れた。missing/not_directory/denied: コンピュータがディレクトリとして読めなかった。
// unreachable: workerが接続できなかった（一覧の取得はfailedで終わる）。
export type TargetDirectoryListingOutcome =
  | 'ok'
  | 'missing'
  | 'not_directory'
  | 'denied'
  | 'unreachable';

export interface TargetDirectoryEntry {
  /** ディレクトリの中でのエントリの名前（ディレクトリの部分は含まない）。 */
  name: string;
  kind: 'directory' | 'file';
  /** SSHユーザーが実行できるファイル（Pythonのインタープリタなど）。 */
  executable: boolean;
}

export interface TargetDirectoryListingResult {
  /** コンピュータが読んだディレクトリ。~は展開済み。 */
  path: string;
  outcome: TargetDirectoryListingOutcome;
  /** コンピュータが返した順。大きいディレクトリでは先頭の一部だけ。 */
  entries: TargetDirectoryEntry[];
  /** ディレクトリには、一覧にしたより多くのエントリがあった。 */
  truncated: boolean;
}

export interface TargetDirectoryListing {
  id: string;
  targetId: string;
  /** リクエストのとおり。 */
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
 * workerが自分の~/.ssh（とMMT_WORKER_SSH_DIR）で見つけたファイル。コンピュータの鍵と
 * known_hostsのパスの候補で、これらはworkerのホスト上のファイルを指す。パスだけで、中身や
 * 指紋は含まない。
 */
export interface WorkerSshFiles {
  keyPaths: string[];
  knownHostsPaths: string[];
}

/**
 * GET /targets/check-workers: コンピュータの確認とディレクトリの読み取りを頼めるオンラインの
 * worker。割り当てられた確認を引き受けるのは、SSHのファイルを報告するworkerだけ。
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
  /** MMT_WORKER_TARGET_IDS: これらのコンピュータの、割り当てのない接続確認。空でもよい。 */
  targetIds?: string[];
  /** workerが行うこと。 */
  kinds: TargetCheckKind[];
  /**
   * workerが今実行しているリクエスト。claimしたが実行していないリクエスト（claimの応答が
   * 失われたもの）は、新しいものをclaimする前に同じleaseで返ってくる。
   */
  activeCheckIds?: string[];
}

// leaseはclaimしたworkerにだけ返し、完了の報告に付けなければならない。
// `check`はclaimした時点のリクエスト（まだ結果は無い）で、どちらの種類でも同じ。
export interface WorkerTargetCheck {
  check: TargetCheck;
  leaseId: string;
  target: ComputeTarget;
  kind: TargetCheckKind;
  /** directory_listing: リクエストのとおりの読むディレクトリ。接続確認ではnull。 */
  directoryPath: string | null;
}

export interface WorkerTargetCheckComplete {
  leaseId: string;
  // failed: workerがプローブを動かせなかったか、コンピュータに届かなかった（理由はresultにある）。
  status: 'finished' | 'failed';
  // 接続確認ならTargetCheckResult、一覧の取得ならTargetDirectoryListingResult。
  result: TargetCheckResult | TargetDirectoryListingResult;
}
