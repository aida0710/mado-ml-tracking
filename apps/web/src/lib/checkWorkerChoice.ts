import type { TargetCheckWorker, TargetCheckWorkerPresence } from '@mmt/contracts';

export function isSameWorker(
  left: TargetCheckWorker | null | undefined,
  right: TargetCheckWorker | null | undefined,
): boolean {
  return Boolean(left && right && left.tokenId === right.tokenId && left.workerId === right.workerId);
}

/** The worker part of a presence, as requests name it. */
export function checkWorkerOf(presence: TargetCheckWorkerPresence): TargetCheckWorker {
  return { tokenId: presence.tokenId, workerId: presence.workerId };
}

/**
 * The worker a dialog starts with: the one that checked the computer last if it is still online,
 * otherwise the only online worker. With several and no history, the person chooses.
 */
export function defaultCheckWorker(
  workers: readonly TargetCheckWorkerPresence[],
  lastUsed: TargetCheckWorker | null,
): TargetCheckWorker | null {
  const online = workers.find((worker) => isSameWorker(checkWorkerOf(worker), lastUsed));
  if (online) return checkWorkerOf(online);
  return workers.length === 1 ? checkWorkerOf(workers[0]!) : null;
}

export function findCheckWorker(
  workers: readonly TargetCheckWorkerPresence[],
  worker: TargetCheckWorker | null,
): TargetCheckWorkerPresence | undefined {
  return workers.find((presence) => isSameWorker(checkWorkerOf(presence), worker));
}
