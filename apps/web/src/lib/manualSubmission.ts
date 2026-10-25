import type { ComputeTarget, ComputeTargetDetails, Job, User } from '@mmt/contracts';
import { isTargetOwner } from './permissions';

/**
 * 手動投入のsiteが、見ている人から見て誰のものか。依頼した本人が、自分のアカウントで自分のJobに
 * `mado-tracking submit`を実行する。コンピュータの所有者は全員のJobを引き受けることもできる
 * （`--all`）。ほかの人のコンピュータは、その人のPC（`--watch --all`で待つ）のことも、依頼した
 * 本人がそれぞれログインするsite（OTPを使うものなど）のこともある。画面からは区別できないので、
 * 両方を伝える。一覧に無くなったsiteは全体のものとして扱う。
 */
export type ManualSiteOwnership =
  | { kind: 'global' }
  | { kind: 'own' }
  | { kind: 'someoneElse'; ownerName: string };

/** 1つの手動投入のsiteで、`mado-tracking submit`を待っているJob。 */
export interface ManualSubmissionGroup {
  targetId: string;
  targetName: string;
  waitingJobs: number;
  ownership: ManualSiteOwnership;
}

/** 依頼した本人がそこで`mado-tracking submit`を実行するまで、Jobが待つsite。 */
export const isManualSite = (
  target: Pick<ComputeTarget, 'executor' | 'submissionMode'> | undefined,
): boolean => target?.executor === 'site' && target.submissionMode === 'manual';

export const isWaitingManualSubmission = (job: Pick<Job, 'status' | 'phase'>): boolean =>
  job.status === 'queued' && job.phase === 'waiting_manual';

/**
 * `mado-tracking submit`の動かし方。`watch`は止めるまで新しいJobを待ち続け（PCがそのまま
 * コンピュータであるとき）、`all`は全員の待っているJobを引き受ける。`all`はコンピュータの
 * 所有者だけができる。
 */
export interface ManualSubmitOptions {
  watch?: boolean;
  all?: boolean;
}

/**
 * 公開したPCの所有者が全員のJobを投入する方法。PCの上で待ち、すべてを引き受ける（ほかの人が
 * `--all`を使うと403 site_owner_requiredになる）。引き受けるのはtokenのProjectのJobなので、
 * 複数のProjectのJobには、Projectごとに1つずつ待ちが要る。
 */
export const OWNER_SUBMIT_OPTIONS: ManualSubmitOptions = { watch: true, all: true };

/**
 * 依頼した本人がsite（そのログインノードか、PCそのもの）で実行するコマンド。そのsiteで待っている
 * 本人のJobを引き受け、siteのjob shellで投入する（arrayは1回で）。
 */
export function manualSubmitCommand(targetId: string, options: ManualSubmitOptions = {}): string {
  return [
    `mado-tracking submit --site ${targetId}`,
    ...(options.watch ? ['--watch'] : []),
    ...(options.all ? ['--all'] : []),
  ].join(' ');
}

/** 手動投入のsiteが、見ている人から見て誰のものか。一覧に無くなったsiteは全体のものとして扱う。 */
export function manualSiteOwnership(
  target: Pick<ComputeTargetDetails, 'ownerUserId' | 'ownerName'> | undefined,
  viewer: Pick<User, 'id'>,
): ManualSiteOwnership {
  if (!target) return { kind: 'global' };
  if (isTargetOwner(viewer, target)) return { kind: 'own' };
  return { kind: 'someoneElse', ownerName: target.ownerName ?? target.ownerUserId };
}

/**
 * 手動投入のsiteごとの待っているJob。siteが一覧に初めて出た順に並べ、見ている人から見て各siteが
 * 誰のものかを添える。
 */
export function manualSubmissionGroups(
  jobs: ReadonlyArray<Pick<Job, 'status' | 'phase' | 'targetId'>>,
  targets: ReadonlyArray<Pick<ComputeTargetDetails, 'id' | 'name' | 'ownerUserId' | 'ownerName'>>,
  viewer: Pick<User, 'id'>,
): ManualSubmissionGroup[] {
  const groups = new Map<string, ManualSubmissionGroup>();
  for (const job of jobs) {
    if (!isWaitingManualSubmission(job)) continue;
    const target = targets.find((item) => item.id === job.targetId);
    const group = groups.get(job.targetId) ?? {
      targetId: job.targetId,
      targetName: target?.name ?? job.targetId,
      waitingJobs: 0,
      ownership: manualSiteOwnership(target, viewer),
    };
    group.waitingJobs += 1;
    groups.set(job.targetId, group);
  }
  return [...groups.values()];
}
