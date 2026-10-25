import type { ApiErrorCode, ComputeTarget, SiteSettings, SiteSubmissionAccount } from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { isLiveLauncher } from '../repositories/launcherRepository.js';
import { findLiveSiteKey } from '../repositories/siteKeyRepository.js';
import { findPersonalSettings } from '../repositories/sitePersonalSettingsRepository.js';
import { findSiteSettings } from '../repositories/siteSettingsRepository.js';
import { canUseTarget, targetNotAvailable } from './siteAccess.js';

function notReady(message: string, code: ApiErrorCode): never {
  throw new DomainError({ status: 422, code, message });
}

/**
 * Jobを作るとき（とルール・フック・Task・Sweepがコンピュータを指定するとき）に確かめる。Jobの
 * 利用者（Runの作成者、またはルール・フック・Task・Sweepの所有者）がそのコンピュータを使える
 * こと、siteに投入に要るものがそろっていること。launcherの鍵はここでは確かめない。あとで
 * 作ったり登録したりすることがある。
 */
export async function assertTargetReadyForJobs(
  connection: Connection,
  usage: { target: ComputeTarget; userId: string },
): Promise<void> {
  const { target } = usage;
  if (!(await canUseTarget(connection, { targetId: target.id, userId: usage.userId })))
    targetNotAvailable(422);
  if (target.executor !== 'site') return;
  const settings = await findSiteSettings(connection, target.id);
  if (!settings?.jobShell) notReady('this computer has no job shell', 'site_job_shell_missing');
  if (target.submissionMode !== 'automatic') return;
  if (!settings.launcherId || !(await isLiveLauncher(connection, settings.launcherId)))
    notReady('no launcher submits to this computer', 'site_launcher_missing');
  if (settings.accountMode === 'personal') {
    const personal = await findPersonalSettings(connection, { targetId: target.id, userId: usage.userId });
    if (!personal?.accountName)
      notReady(
        'this computer runs with personal accounts; register your account name in "My settings" of the computer',
        'site_account_required',
      );
  }
}

function submissionFailure(message: string): never {
  throw new DomainError({ status: 422, code: 'site_submission_unready', message });
}

/**
 * job shellの1回の呼び出しを、誰のアカウントで動かすか。launcherは、共有のアカウントか、
 * 依頼者のためにlauncherが持つ鍵で依頼者としてログインする。手動の投入は、投入した人として、
 * その人の作業ディレクトリと変数で動く。DomainErrorは、そのメッセージで投入を失敗にする。
 */
export async function resolveSubmissionAccount(
  connection: Connection,
  submission: {
    target: ComputeTarget;
    settings: SiteSettings;
    requesterId: string;
    submittingUserId: string | null;
  },
): Promise<SiteSubmissionAccount> {
  const { target, settings } = submission;
  if (target.submissionMode === 'automatic') {
    const userId = settings.accountMode === 'shared' ? null : submission.requesterId;
    const personal = userId
      ? await findPersonalSettings(connection, { targetId: target.id, userId })
      : undefined;
    if (userId && !personal?.accountName)
      submissionFailure('the person who requested it has no personal settings (account name) for this computer');
    const key = await findLiveSiteKey(connection, { targetId: target.id, userId });
    if (!key || key.status !== 'ready')
      submissionFailure('the launcher has not created the key of this account yet');
    const workDirectory = personal?.workDirectory || settings.workDirectory;
    if (!workDirectory) submissionFailure('the working directory of this computer is not set');
    return {
      mode: settings.accountMode,
      accountName: personal?.accountName ?? settings.sharedAccount,
      workDirectory,
      variables: { ...settings.variables, ...personal?.variables },
      keyId: key.id,
    };
  }
  const personal = await findPersonalSettings(connection, {
    targetId: target.id,
    userId: submission.submittingUserId ?? submission.requesterId,
  });
  return {
    mode: 'personal',
    accountName: '',
    workDirectory: personal?.workDirectory || settings.workDirectory,
    variables: { ...settings.variables, ...personal?.variables },
    keyId: null,
  };
}
