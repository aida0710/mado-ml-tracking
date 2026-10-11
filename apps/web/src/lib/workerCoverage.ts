import type { ComputeTarget, WorkerPresence } from '@mmt/contracts';

/**
 * Whether a worker is there to take a computer's work, from the workers the screen may list:
 * - `notNeeded`: a site, whose Jobs a launcher or `mado-tracking submit` sends instead.
 * - `online`: at least one worker in charge answered within the last two minutes.
 * - `offline`: the workers in charge stopped answering; `lastSeenAt` is the latest answer.
 * - `none`: no worker has ever said it takes this computer.
 */
export type WorkerCoverage =
  | { state: 'notNeeded' }
  | { state: 'online'; onlineCount: number }
  | { state: 'offline'; lastSeenAt: string }
  | { state: 'none' };

type CoveredTarget = Pick<ComputeTarget, 'id' | 'executor'>;
type CoveringWorker = Pick<WorkerPresence, 'targetIds' | 'status' | 'lastSeenAt'>;

/**
 * A worker claims the Jobs of its token's Project on the computers in MMT_WORKER_TARGET_IDS, or on
 * every computer when it names none (WorkerService.claim).
 */
export const takesJobsOn = (worker: Pick<WorkerPresence, 'targetIds'>, targetId: string): boolean =>
  worker.targetIds === null || worker.targetIds.includes(targetId);

/**
 * A connection check nobody chose a worker for goes to a worker that names the computer in
 * MMT_WORKER_TARGET_IDS (TargetCheckService); one that names none does not take it.
 */
export const takesChecksOf = (
  worker: Pick<WorkerPresence, 'targetIds'>,
  targetId: string,
): boolean => worker.targetIds !== null && worker.targetIds.includes(targetId);

function coverageOf(workers: readonly CoveringWorker[]): WorkerCoverage {
  const onlineCount = workers.filter((worker) => worker.status === 'online').length;
  if (onlineCount > 0) return { state: 'online', onlineCount };
  const lastSeenAt = workers
    .map((worker) => worker.lastSeenAt)
    .sort()
    .at(-1);
  return lastSeenAt ? { state: 'offline', lastSeenAt } : { state: 'none' };
}

/**
 * Who takes the computer's Jobs among the Project's workers (GET /projects/:p/workers): a Job of
 * the Project is claimed only by a worker of the same Project.
 */
export function jobWorkerCoverage(
  target: CoveredTarget,
  workers: readonly CoveringWorker[],
): WorkerCoverage {
  if (target.executor === 'site') return { state: 'notNeeded' };
  return coverageOf(workers.filter((worker) => takesJobsOn(worker, target.id)));
}

/** Who takes the computer's connection check among every Project's workers (GET /workers). */
export function checkWorkerCoverage(
  target: CoveredTarget,
  workers: readonly CoveringWorker[],
): WorkerCoverage {
  if (target.executor === 'site') return { state: 'notNeeded' };
  return coverageOf(workers.filter((worker) => takesChecksOf(worker, target.id)));
}

/** Jobs or checks sent to the computer now wait until a worker starts. */
export const isWorkerMissing = (coverage: WorkerCoverage): boolean =>
  coverage.state === 'offline' || coverage.state === 'none';
