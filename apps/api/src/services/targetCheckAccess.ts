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
  if (!target) notFound('ComputeTarget');
  return target;
}

/**
 * The computer someone asks a worker to check or read. Workers reach ssh and local computers with
 * their own SSH keys, so those who may add and keep them ask: global administrators.
 */
export async function findCheckableTarget(
  connection: Connection,
  principal: Principal,
  targetId: string,
): Promise<ComputeTarget> {
  requireGlobalAdmin(principal);
  const target = await findTarget(connection, targetId);
  // No worker connects to a site, so a request would only wait and fail as no_worker.
  if (target.executor === 'site')
    throw new DomainError(
      422,
      'siteにはtrackingから接続しないため、接続確認はできません',
      'site_check_unsupported',
    );
  return target;
}

/** A chosen worker must be online and claim what is assigned to it, or the request waits in vain. */
export async function requireCheckWorker(
  connection: Connection,
  worker: TargetCheckWorker,
): Promise<void> {
  if (!(await isCheckWorker(connection, worker)))
    throw new DomainError(
      422,
      '選んだworkerはオンラインでないか、接続確認を受けられないバージョンです',
      'target_check_worker_unavailable',
    );
}
