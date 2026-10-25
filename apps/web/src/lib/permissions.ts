import type { ComputeTarget, ProjectRole, User } from '@mmt/contracts';

// APIの検査（accessService.requireProject / requireGlobalAdmin）に合わせ、APIが拒む操作を
// 画面に出さない。判断の正本はAPIのままで、ここは何を表示するかを決めるだけ。

export function isGlobalAdmin(user: Pick<User, 'isAdmin'>): boolean {
  return user.isAdmin;
}

/** Run、バージョン、Task、Jobの登録には、少なくともeditorのロールが要る。 */
export function canEditProject(role: ProjectRole): boolean {
  return role !== 'viewer';
}

/**
 * Projectの設定（説明、公開範囲、保存先）、メンバー、サービス用のtoken、Projectのアーカイブには
 * Project adminのロールが要る。全体管理者のセッションはadminになる。
 */
export function canManageProject(role: ProjectRole): boolean {
  return role === 'admin';
}

/** プラグインの接続は、Project adminか全体管理者が管理できる。 */
export function canManagePlugins(role: ProjectRole | undefined, globalAdmin: boolean): boolean {
  return globalAdmin || (role !== undefined && canManageProject(role));
}

/** モデルの自動実行ルールは、プラグインと同じ規則に従う（modelAutomationService）。 */
export function canManageAutomationRules(role: ProjectRole, globalAdmin: boolean): boolean {
  return globalAdmin || canManageProject(role);
}

/** 昇格policyは、Project adminか全体管理者が作成し、切り替える。 */
export function canManagePromotionPolicies(role: ProjectRole, globalAdmin: boolean): boolean {
  return globalAdmin || canManageProject(role);
}

/**
 * 昇格の判定をやり直すには、Project adminのロールそのものが要る。editorにも許すと、通るまで
 * やり直せてしまう。メンバーでない全体管理者は、`role`がadminになる。
 */
export function canReevaluatePromotion(role: ProjectRole): boolean {
  return canManageProject(role);
}

/**
 * 無効にされていない、サインイン済みの利用者なら誰でもProjectを作れる（projectService.create）。
 * 「無効でない」で判定するのは、まだstatusを送らないAPIからのセッションでも動くようにするため。
 */
export function canCreateProject(user: Pick<User, 'status'>): boolean {
  return user.status !== 'disabled';
}

/** ここでパスワードを持つのはローカルの認証情報を持つ利用者だけ。SSOの利用者はIdPで変える。 */
export function canChangeOwnPassword(user: Pick<User, 'authSources'>): boolean {
  return user.authSources.includes('local');
}

/** aliasの保護は、昇格policyと同じ規則に従う（aliasProtectionService）。 */
export function canManageAliasProtections(role: ProjectRole, globalAdmin: boolean): boolean {
  return globalAdmin || canManageProject(role);
}

// 本人が始めた作業。editorのままでいる作成者か、Project adminが操作できる。
function controlsStartedWork(role: ProjectRole, userId: string, work: { createdBy: string }) {
  return canManageProject(role) || (canEditProject(role) && work.createdBy === userId);
}

/**
 * Sweepの一時停止、再開、中止、規模の変更（sweepService。ほかのeditorには403
 * sweep_owner_requiredが返る）。
 */
export function canControlSweep(role: ProjectRole, userId: string, sweep: { createdBy: string }): boolean {
  return controlsStartedWork(role, userId, sweep);
}

/**
 * Jobの停止と再試行（checkpointからのものも含む）。`createdBy`はJobの作成者、つまりそのRunの
 * 作成者（jobService。ほかのeditorには403 job_owner_requiredが返る）。
 */
export function canControlJob(role: ProjectRole, userId: string, job: { createdBy: string }): boolean {
  return controlsStartedWork(role, userId, job);
}

/**
 * ワークフローの実行の停止と、新しい実行での再開（workflowExecutionService。ほかのeditorには
 * 403 workflow_control_forbiddenが返る）。
 */
export function canControlWorkflowExecution(
  role: ProjectRole,
  userId: string,
  execution: { createdBy: string },
): boolean {
  return controlsStartedWork(role, userId, execution);
}

/**
 * フック: 研究者（editor）なら誰でも作成、有効・無効の切り替え、'manual'のフックの開始ができる
 * （hookServiceがjobs:writeとともにeditorのロールを検査する）。フックは所有者の権限で動く。
 */
export function canManageHooks(role: ProjectRole): boolean {
  return canEditProject(role);
}

/**
 * フックをService Accountへ移すと、誰の権限で動くかが変わる。そのため自動実行ルールと同じ規則で、
 * Project adminか全体管理者だけが行える（hookService.transferOwner）。
 */
export function canTransferHookOwners(role: ProjectRole, globalAdmin: boolean): boolean {
  return globalAdmin || canManageProject(role);
}

/**
 * コンピュータの追加: サインインしていれば誰でもsiteを追加でき（セッションからのPOST /targets）、
 * その所有者になる。全体管理者はsshとlocalのコンピュータも追加できる。
 */
export function canAddTarget(user: Pick<User, 'status'>): boolean {
  return user.status !== 'disabled';
}

/** sshとlocalのコンピュータはworker自身のSSH鍵で動くので、追加できるのは全体管理者だけ。 */
export function canAddSshOrLocalTarget(user: Pick<User, 'isAdmin'>): boolean {
  return isGlobalAdmin(user);
}

/** コンピュータを追加した人が、その所有者になる。 */
export function isTargetOwner(
  user: Pick<User, 'id'>,
  target: Pick<ComputeTarget, 'ownerUserId'>,
): boolean {
  return target.ownerUserId === user.id;
}

/**
 * コンピュータの編集（公開範囲も含む）、そのjob shellと共有アカウントの鍵の保存、そこでの全員の
 * 設定の保存は、全体管理者か所有者が行う（targetService）。使える人は誰でもjob shellを読め、
 * 自分の設定と鍵を持てる。
 */
export function canManageTarget(
  user: Pick<User, 'id' | 'isAdmin'>,
  target: Pick<ComputeTarget, 'ownerUserId'>,
): boolean {
  return isGlobalAdmin(user) || isTargetOwner(user, target);
}
