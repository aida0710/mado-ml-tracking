import type { ComputeTarget } from './index.js';

/**
 * Webの画面で追加したコンピュータ（docs/sites.md）。siteの設定はtrackingに置く。所有者か
 * 全体管理者が編集する全体設定（接続、job shell、作業ディレクトリなど）と、研究者それぞれが
 * 自分用に編集する個人の設定（アカウント、変数）がある。鍵は置かない。launcherが作り、
 * 公開鍵の側だけを公開する。
 */

/** 自動のsiteでlauncherがログインする方法。1つの共用アカウントか、依頼者それぞれのアカウント。 */
export type SiteAccountMode = 'shared' | 'personal';
export const SITE_ACCOUNT_MODES: readonly SiteAccountMode[] = ['shared', 'personal'];

/** JobのGPUを選ぶもの。スケジューラか、スケジューラの無いホストでleaseGpuIdsから選ぶrunner。 */
export type SiteGpuAssignment = 'scheduler' | 'lease';
export const SITE_GPU_ASSIGNMENTS: readonly SiteGpuAssignment[] = ['scheduler', 'lease'];

/** job shellはデータではなくスクリプトなので、これより大きいものは間違い。 */
export const MAX_JOB_SHELL_BYTES = 1024 * 1024;
/** ログインホストと経由するホストのknown_hosts。 */
export const MAX_KNOWN_HOSTS_BYTES = 64 * 1024;
export const MAX_SITE_JUMP_HOSTS = 8;
/** siteまたは1人分のMMT_VAR_<name>の値。 */
export const MAX_SITE_VARIABLES = 64;
export const DEFAULT_SITE_SSH_PORT = 22;
export const DEFAULT_SITE_RUNNER_PYTHON = 'python3';
/** 止めたコンテナが終了するまで待つ時間。過ぎるとrunnerが強制終了する。 */
export const DEFAULT_SITE_CANCEL_GRACE_SECONDS = 10;
export const MAX_SITE_CANCEL_GRACE_SECONDS = 3600;
/** 1つのJobが保存できる出力の数（workerのMMT_WORKER_MAX_OUTPUT_FILES）。 */
export const DEFAULT_SITE_MAX_OUTPUT_FILES = 10_000;
export const MAX_SITE_MAX_OUTPUT_FILES = 1_000_000;
/**
 * launcherが1回のポーリングで1つのsiteについてclaimするsubmissionの数
 * （最大SITE_CLAIM_MAX_SUBMISSIONS）。
 */
export const DEFAULT_SITE_MAX_ACTIVE_SUBMISSIONS = 10;
/** この時間内にどのlauncherも応答しなかった接続確認は失敗にする。 */
export const SITE_CONNECTION_CHECK_TIMEOUT_SECONDS = 5 * 60;

/*
 * launcherがsshとjob shellに、別々の引数と環境変数として渡す値の形（シェルは通さない）。APIが
 * これを強制し、Webの画面が先に確かめる。各値が1語に収まることだけを保証する。
 */
export const MAX_SITE_HOST_LENGTH = 253;
/** ホストは"-"で始まってもいけない（sshがオプションとして読むため）。 */
export const SITE_HOST_PATTERN = /^[A-Za-z0-9.:_-]+$/;
export const MAX_SITE_JUMP_HOST_LENGTH = 300;
/** ssh -Jが受け取る形の[user@]host[:port]。 */
export const SITE_JUMP_HOST_PATTERN = /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+(?::\d{1,5})?$/;
/** POSIX風のアカウント名。スケジューラのあるsiteはどれもこれを使う。 */
export const MAX_SITE_ACCOUNT_NAME_LENGTH = 64;
export const SITE_ACCOUNT_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
/** job shellのパスの規則（deploy/sites/README.md）: 英数字と._/+@-だけ。 */
export const MAX_SITE_PATH_LENGTH = 4000;
export const SITE_PATH_PATTERN = /^\/[A-Za-z0-9._/+@-]*$/;
/** runnerPythonは、python3のようなコマンド名だけでもよい。 */
export const SITE_RUNNER_PYTHON_PATTERN = /^[A-Za-z0-9._/+@-]+$/;
export const MAX_SITE_CANCEL_COMMAND_LENGTH = 2000;
/** MMT_VAR_<name>: 環境変数の名前。 */
export const MAX_SITE_VARIABLE_NAME_LENGTH = 64;
export const SITE_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_SITE_VARIABLE_VALUE_LENGTH = 1000;

/** launcherがログインする先。自動のsiteだけ。 */
export interface SiteConnection {
  host: string;
  port: number;
  /** 順に経由するホスト。[user@]host[:port]の形。 */
  jumpHosts: string[];
  /** ホストとすべての経由するホストのknown_hostsの行。知らないホスト鍵は受け入れない。 */
  knownHosts: string;
}

/** siteのjob shellの1つのバージョン。バージョンは変わらず、編集すると次のバージョンを足す。 */
export interface SiteJobShellSummary {
  id: string;
  targetId: string;
  version: number;
  sha256: string;
  sizeBytes: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

export interface SiteJobShell extends SiteJobShellSummary {
  content: string;
}

/** POST /targets/:id/job-shells: 次のバージョン。以後のsubmissionはすべてこれを使う。 */
export interface SiteJobShellCreate {
  content: string;
}

/** siteの全体設定。所有者か全体管理者が編集する。 */
export interface SiteSettings {
  /** 投入するlauncher。自動のsiteだけ。 */
  launcherId: string | null;
  connection: SiteConnection | null;
  /** 手動のsiteは常に'personal'。`mado-tracking submit`を実行した人が投入する。 */
  accountMode: SiteAccountMode;
  /** 共用アカウントを使う自動のsiteのSSHユーザー。それ以外は''。 */
  sharedAccount: string;
  /** 計算ノードからも見える、site上の絶対パスのディレクトリ。各自が自分の値を設定できる。 */
  workDirectory: string;
  runnerPython: string;
  /** 計算ノードから見たAPI。nullなら、launcherかsubmitが使うURLを使う。 */
  runnerApiUrl: string | null;
  /** キューにあるスケジューラのジョブを取り消す。MMT_SCHEDULER_JOB_IDを読む。 */
  cancelCommand: string | null;
  gpuAssignment: SiteGpuAssignment;
  /** スケジューラの無いホストでrunnerがleaseできるGPU。[]ならすべて。 */
  leaseGpuIds: string[];
  /** job shellに渡すMMT_VAR_<name>の値。各自の変数がこれを上書きする。 */
  variables: Record<string, string>;
  cancelGraceSeconds: number;
  maxOutputFiles: number;
  maxActiveSubmissions: number;
  /** 今のjob shell。保存されるまではnull。 */
  jobShell: SiteJobShellSummary | null;
}

/** 作成・更新で渡す全体設定。job shellは別に（バージョンを付けて）保存する。 */
export type SiteSettingsInput = Partial<Omit<SiteSettings, 'jobShell'>>;

/**
 * GET/POST/PATCH /targets: コンピュータを使える人・管理できる人に返すもの。`site`は所有者と
 * 全体管理者にだけ入る。使う人には、そのコンピュータが何かは見えるが、どうつなぐかは見えない。
 */
export interface ComputeTargetDetails extends ComputeTarget {
  ownerName: string | null;
  site: SiteSettings | null;
  /**
   * site: そのJobが誰のアカウントで動くか。コンピュータを使えるすべての人に返し、アカウント名を
   * 保存すべきかが分かるようにする。ほかのコンピュータではnull。
   */
  siteAccountMode: SiteAccountMode | null;
}

/**
 * POST /targetsがsiteについてComputeTargetのフィールドのほかに受け取るもの。PATCH /targets/:id
 * では`site`について受け取る。コンピュータを追加した人がその所有者になる。全体管理者でない
 * 研究者が追加できるのはsiteだけ。
 */
export interface ComputeTargetSiteFields {
  site?: SiteSettingsInput;
  /** job shellの最初のバージョン。 */
  jobShell?: string;
}

export type SiteKeyStatus = 'requested' | 'ready';
export const SITE_KEY_STATUSES: readonly SiteKeyStatus[] = ['requested', 'ready'];

/**
 * 自動のsiteにログインするためにlauncherが作った鍵。秘密鍵はlauncherのホストから出ず、公開鍵は
 * アカウントの所有者がsiteで許可できるよう表示する。
 */
export interface SiteKey {
  id: string;
  targetId: string;
  /** null: 共用アカウントの鍵。それ以外は、この人の自分のアカウント用の鍵。 */
  userId: string | null;
  launcherId: string;
  status: SiteKeyStatus;
  /** launcherが鍵を作ったあとの、OpenSSHの公開鍵の行（ssh-ed25519 …）。 */
  publicKey: string | null;
  /** ssh-keygen -lが表示する形のSHA256:…。 */
  fingerprint: string | null;
  requestedAt: string;
  readyAt: string | null;
}

/** POST /targets/:id/keys/rotate: 共用の鍵（personal=false）か自分の鍵を入れ替える。 */
export interface SiteKeyRotate {
  personal: boolean;
}

/** 1つのsiteについての、ある人の自分の設定。 */
export interface SitePersonalSettings {
  targetId: string;
  userId: string;
  userName: string | null;
  /** 本人のアカウントで動く自動のsiteでログインするSSHユーザー。ほかのsiteでは''。 */
  accountName: string;
  /** siteの作業ディレクトリを置き換える。 */
  workDirectory: string | null;
  /** siteの変数に重ねる。 */
  variables: Record<string, string>;
  /** 本人のアカウントで動く自動のsite: この人のアカウント用のlauncherの鍵。 */
  key: SiteKey | null;
  updatedAt: string;
}

/** GET /targets/:id/personal-settings/me: そのsiteの設定を保存するまではnull。 */
export interface SitePersonalSettingsLookup {
  item: SitePersonalSettings | null;
}

/** PUT /targets/:id/personal-settings/me: 自分の設定。省略したフィールドは値を保つ。 */
export interface SitePersonalSettingsInput {
  accountName?: string;
  workDirectory?: string | null;
  variables?: Record<string, string>;
}

export type SiteConnectionCheckStatus = 'queued' | 'succeeded' | 'failed';
export const SITE_CONNECTION_CHECK_STATUSES: readonly SiteConnectionCheckStatus[] = [
  'queued',
  'succeeded',
  'failed',
];

/** launcherが鍵とアカウントで1回ログインし、`true`を実行する。何も投入しない。 */
export interface SiteConnectionCheck {
  id: string;
  targetId: string;
  /** null: 共用アカウント。それ以外は、この人のアカウント。 */
  userId: string | null;
  requestedBy: string;
  status: SiteConnectionCheckStatus;
  /** launcherが見たもの（sshのエラーの末尾）、またはどのlauncherも応答しなかった理由。 */
  message: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** POST /targets/:id/connection-checks. */
export interface SiteConnectionCheckRequest {
  personal: boolean;
}

/**
 * Webの画面で登録したlauncher。自分のtokenで認証し、割り当てられた自動のsiteのJobを、Projectを
 * 問わず投入する。
 */
export interface Launcher {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  /** 最後に設定を読んだかclaimした時刻。初回の前はnull。 */
  lastSeenAt: string | null;
  revokedAt: string | null;
  /** 今のtokenの先頭12文字。全体管理者にだけ返す。 */
  tokenPrefix: string | null;
}

/** POST /launchers（全体管理者）。 */
export interface LauncherCreate {
  name: string;
}

/** tokenは1回だけ表示する。launcherはtokenのファイルから読む。 */
export interface LauncherCreated {
  launcher: Launcher;
  token: string;
}

/** job shellの呼び出しを誰のアカウントで動かすかと、そのための作業ディレクトリと変数。 */
export interface SiteSubmissionAccount {
  mode: SiteAccountMode;
  /** SSHユーザー。手動の投入では''で、投入する人として動く。 */
  accountName: string;
  workDirectory: string;
  /** siteの変数に、その人自身の変数を重ねたもの。 */
  variables: Record<string, string>;
  /** ログインに使うlauncherの鍵。手動の投入ではnull。 */
  keyId: string | null;
}

export interface LauncherSite {
  target: ComputeTarget;
  settings: SiteSettings;
  jobShell: SiteJobShell | null;
}

/**
 * このlauncherの有効な鍵すべて。launcherは要求されたものを作り（PUT /launcher/keys/:id）、
 * 一覧に無くなったローカルの秘密鍵を消す。
 */
export interface LauncherKey {
  id: string;
  targetId: string;
  userId: string | null;
  status: SiteKeyStatus;
  publicKey: string | null;
}

export interface LauncherConnectionCheck {
  id: string;
  targetId: string;
  account: SiteSubmissionAccount;
}

/**
 * GET /manual-submissions/sites/:targetId: 手動のsiteで`mado-tracking submit`が使うもの。
 * 呼び出した人自身のアカウント（作業ディレクトリと変数）を含む。
 */
export interface ManualSiteConfiguration {
  target: ComputeTarget;
  settings: SiteSettings;
  jobShell: SiteJobShell | null;
  account: SiteSubmissionAccount;
}

/** GET /launcher/config: launcherが次のポーリングに必要とするもの。 */
export interface LauncherConfiguration {
  launcher: { id: string; name: string };
  sites: LauncherSite[];
  keys: LauncherKey[];
  checks: LauncherConnectionCheck[];
}

/** PUT /launcher/keys/:id. */
export interface LauncherKeyPublish {
  publicKey: string;
}

/** POST /launcher/connection-checks/:id. */
export interface LauncherConnectionCheckResult {
  outcome: 'succeeded' | 'failed';
  message?: string | null;
}
