import type { ComputeTarget, Job } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, type Connection } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { targetUsableSql } from '../repositories/computeTargetAccessRepository.js';
import { requireGlobalAdmin } from './accessService.js';
import { requireSession } from './tokenService.js';

/** requireGlobalAdminを問いの形にしたもの。全体管理者のsessionか、制限の無いadminのtokenか。 */
export function isGlobalAdministrator(principal: Principal): boolean {
  try {
    requireGlobalAdmin(principal);
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}

/**
 * コンピュータの設定、公開範囲、job shell、共有の鍵を扱うのは、その管理者。つまり、ブラウザの
 * sessionでの全体管理者か所有者。
 */
export function requireTargetManager(principal: Principal, target: ComputeTarget): void {
  if (isGlobalAdministrator(principal)) return;
  if (target.ownerUserId !== principal.user.id)
    throw new DomainError({
      status: 403,
      code: 'target_owner_required',
      message: 'only the owner or a global administrator can change the settings of this computer',
    });
  requireSession(principal, 'changing computer settings');
}

export function isTargetManager(
  principal: Principal,
  target: Pick<ComputeTarget, 'ownerUserId'>,
): boolean {
  return isGlobalAdministrator(principal) || target.ownerUserId === principal.user.id;
}

/** その利用者として動くJobを、そのコンピュータで動かしてよいか（targetUsableSql）。 */
export async function canUseTarget(
  connection: Connection,
  usage: { targetId: string; userId: string },
): Promise<boolean> {
  return !!(await first(
    connection,
    `SELECT 1 FROM compute_targets t WHERE t.id=$1 AND ${targetUsableSql('$2::uuid')}`,
    [usage.targetId, usage.userId],
  ));
}

/**
 * 順番待ちのJobの依頼者（Runの作成者）が、今もそのコンピュータを使えるか。Jobを作ったあとで、
 * コンピュータが非公開になったり、所有者が変わったりしていることがある。
 */
export async function canRunQueuedJob(
  connection: Connection,
  job: Pick<Job, 'runId' | 'targetId'>,
): Promise<boolean> {
  return !!(await first(
    connection,
    `SELECT 1 FROM compute_targets t JOIN runs r ON r.id=$2 WHERE t.id=$1 AND ${targetUsableSql('r.created_by')}`,
    [job.targetId, job.runId],
  ));
}

export const TARGET_NOT_AVAILABLE_MESSAGE =
  'this computer is private; only jobs of its owner and of service accounts the owner created run on it';

/** 非公開のコンピュータを使えない人（Job・ルール・フックの所有者）のJobを拒む。 */
export function targetNotAvailable(status: 403 | 422): never {
  throw new DomainError({
    status: status,
    code: 'target_not_available',
    message: TARGET_NOT_AVAILABLE_MESSAGE,
  });
}

/**
 * コンピュータがあることは誰でも見える（GET /targets/overview）が、job shell、鍵、個人の設定は、
 * それを使える人・管理できる人のためのもの。
 */
export async function requireTargetUser(
  connection: Connection,
  principal: Principal,
  target: ComputeTarget,
): Promise<void> {
  if (isTargetManager(principal, target)) return;
  if (!(await canUseTarget(connection, { targetId: target.id, userId: principal.user.id })))
    targetNotAvailable(403);
}

export async function findSiteTarget(
  connection: Connection,
  targetId: string,
  options: { lock?: boolean } = {},
): Promise<ComputeTarget> {
  const target = await first<ComputeTarget>(
    connection,
    `SELECT * FROM compute_targets WHERE id=$1 AND executor='site'${options.lock ? ' FOR UPDATE' : ''}`,
    [targetId],
  );
  if (!target) notFound('computer');
  return target;
}
