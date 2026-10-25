import type { TargetCheckWorker, TargetCheckWorkerPresence } from '@mmt/contracts';

export function isSameWorker(
  left: TargetCheckWorker | null | undefined,
  right: TargetCheckWorker | null | undefined,
): boolean {
  return Boolean(left && right && left.tokenId === right.tokenId && left.workerId === right.workerId);
}

/** presenceのうち、要求でworkerを指すのに使う部分。 */
export function checkWorkerOf(presence: TargetCheckWorkerPresence): TargetCheckWorker {
  return { tokenId: presence.tokenId, workerId: presence.workerId };
}

/**
 * ダイアログで最初に選ぶworker。最後にコンピュータを確認したworkerがまだオンラインならそれ、
 * そうでなければオンラインのただ1つのworker。複数あって履歴が無ければ、利用者が選ぶ。
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
