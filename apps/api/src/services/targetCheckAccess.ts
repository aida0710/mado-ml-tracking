import type { ComputeTarget, TargetCheckWorker } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, type Connection } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { isCheckWorker } from '../repositories/targetCheckWorkerRepository.js';
import { requireGlobalAdmin } from './accessService.js';

export async function findTarget(connection: Connection, targetId: string): Promise<ComputeTarget> {
  const target = await first<ComputeTarget>(
    connection,
    'SELECT * FROM compute_targets WHERE id=$1',
    [targetId],
  );
  if (!target) notFound('computer');
  return target;
}

/**
 * workerに確認や読み取りを頼む対象のコンピュータ。workerはsshとlocalのコンピュータに自分の
 * SSHの鍵で入るので、頼めるのはそれらを追加・管理できる人、つまり全体管理者。
 */
export async function findCheckableTarget(
  connection: Connection,
  principal: Principal,
  targetId: string,
): Promise<ComputeTarget> {
  requireGlobalAdmin(principal);
  const target = await findTarget(connection, targetId);
  // siteにはどのworkerもつながらないので、頼んでも待ったあとにno_workerで失敗するだけ。
  if (target.executor === 'site')
    throw new DomainError({
      status: 422,
      code: 'site_check_unsupported',
      message: 'tracking does not connect to sites, so they cannot be checked',
    });
  return target;
}

/**
 * 選んだworkerは、オンラインで、割り当てたものをclaimするものでなければならない。そうでなければ
 * リクエストはむだに待つだけになる。
 */
export async function requireCheckWorker(
  connection: Connection,
  worker: TargetCheckWorker,
): Promise<void> {
  if (!(await isCheckWorker(connection, worker)))
    throw new DomainError({
      status: 422,
      code: 'target_check_worker_unavailable',
      message: 'the chosen worker is not online or its version cannot run connection checks',
    });
}
