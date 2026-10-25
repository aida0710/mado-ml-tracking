import type { ComputeTargetExecutor } from './index.js';
import type { CpuArch, SiteSubmissionMode } from './siteExecution.js';

/**
 * コンピュータで誰のJobを動かせるか（docs/sites.md）。publicのコンピュータはすべてのProjectの
 * Jobを受け付ける。privateのコンピュータは、所有者と、所有者が作ったService AccountのJobだけを
 * 受け付ける。privateのコンピュータには必ず所有者がいる。全体管理者はすべてのコンピュータを
 * 管理するが、他人のprivateのコンピュータでJobを動かせないのはほかの人と同じ。
 */
export type ComputeTargetVisibility = 'public' | 'private';
export const COMPUTE_TARGET_VISIBILITIES: readonly ComputeTargetVisibility[] = ['public', 'private'];

/** 自動のsiteのJobを投入するlauncherの、誰でも見てよい情報。 */
export interface ComputeTargetLauncherStatus {
  name: string;
  /** launcherが最後に設定を読んだかclaimした時刻。初回より前はnull。 */
  lastSeenAt: string | null;
  revoked: boolean;
}

/**
 * GET /targets/overview: すべてのコンピュータ（他人のprivateのものも含む）を、誰が知ってもよい
 * 情報だけで返す。接続の仕方（host、アカウント、パス、siteの設定）は、使うか管理してよい人に
 * GET /targetsで返す。
 */
export interface ComputeTargetOverview {
  id: string;
  name: string;
  executor: ComputeTargetExecutor;
  /** siteで、launcherと依頼した本人（`mado-tracking submit`）のどちらが投入するか。 */
  submissionMode: SiteSubmissionMode;
  cpuArch: CpuArch;
  /** siteで、job shellがarrayを1回の呼び出しで投入する。 */
  supportsArray: boolean;
  enabled: boolean;
  visibility: ComputeTargetVisibility;
  ownerUserId: string;
  ownerName: string | null;
  /** 呼び出した人のJobをここで動かせる。 */
  usable: boolean;
  /** 呼び出した人が、このコンピュータとそのjob shell・鍵を変更できる。所有者か全体管理者。 */
  canManage: boolean;
  /** launcherを指定した自動のsiteで入る。ほかのコンピュータではnull。 */
  launcher: ComputeTargetLauncherStatus | null;
}
