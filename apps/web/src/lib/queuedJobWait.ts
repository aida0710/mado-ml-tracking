import type { ComputeTarget, JobListItem, WorkerCapability, WorkerPresence } from '@mmt/contracts';
import {
  isWorkerMissing,
  jobWorkerCoverage,
  takesJobsOn,
  type WorkerCoverage,
} from './workerCoverage';

/**
 * Why a queued ssh or local Job has not started:
 * - `worker`: no worker of the Project takes its computer, or they stopped answering; it starts
 *   only once one runs.
 * - `workerUpdate`: workers answer, but none of the online ones taking its computer names every
 *   feature the Job needs (an older worker, such as one before workflow steps); the API gives it
 *   only to a worker that does, so it starts once the worker is updated.
 * - `notTaken`: a worker answers but has not taken the Job. The screen cannot tell which of the
 *   worker's reasons holds (the computer is busy or disabled, its GPUs are held, it lacks the
 *   code's runtime, or the API's local executor is off), so it lists them.
 * null for every other Job: a site Job says where it is through its phase.
 */
export type QueuedJobWait =
  | { kind: 'worker'; coverage: WorkerCoverage }
  | { kind: 'workerUpdate'; missingCapabilities: WorkerCapability[] }
  | { kind: 'notTaken' };

type WaitingJob = Pick<JobListItem, 'status' | 'targetId' | 'requiredWorkerCapabilities'>;
type JobTarget = Pick<ComputeTarget, 'id' | 'name' | 'executor'>;
type ProjectWorker = Pick<WorkerPresence, 'targetIds' | 'status' | 'lastSeenAt' | 'capabilities'>;

/**
 * The features the Job needs that keep every online worker on its computer from taking it, or
 * none when one of them names them all.
 */
function capabilitiesWorkersLack(
  job: WaitingJob,
  target: JobTarget,
  workers: readonly ProjectWorker[],
): WorkerCapability[] {
  const onlineOnTarget = workers.filter(
    (worker) => worker.status === 'online' && takesJobsOn(worker, target.id),
  );
  const names = (worker: ProjectWorker, capability: WorkerCapability) =>
    worker.capabilities.includes(capability);
  const canTake = (worker: ProjectWorker) =>
    job.requiredWorkerCapabilities.every((capability) => names(worker, capability));
  if (onlineOnTarget.some(canTake)) return [];
  return job.requiredWorkerCapabilities.filter(
    (capability) => !onlineOnTarget.every((worker) => names(worker, capability)),
  );
}

export function queuedJobWait(
  job: WaitingJob,
  target: JobTarget | undefined,
  workers: readonly ProjectWorker[],
): QueuedJobWait | null {
  if (job.status !== 'queued' || !target || target.executor === 'site') return null;
  const coverage = jobWorkerCoverage(target, workers);
  if (isWorkerMissing(coverage)) return { kind: 'worker', coverage };
  const missingCapabilities = capabilitiesWorkersLack(job, target, workers);
  return missingCapabilities.length ? { kind: 'workerUpdate', missingCapabilities } : { kind: 'notTaken' };
}

/** Queued Jobs that wait for a worker, per computer, in the order the computers first appear. */
export interface WorkerlessJobGroup {
  target: JobTarget;
  coverage: WorkerCoverage;
  waitingJobs: number;
}

export function workerlessJobGroups({
  jobs,
  targets,
  workers,
}: {
  jobs: readonly WaitingJob[];
  targets: readonly JobTarget[];
  workers: readonly ProjectWorker[];
}): WorkerlessJobGroup[] {
  const groups = new Map<string, WorkerlessJobGroup>();
  for (const job of jobs) {
    const target = targets.find((candidate) => candidate.id === job.targetId);
    const wait = queuedJobWait(job, target, workers);
    if (!target || wait?.kind !== 'worker') continue;
    const group = groups.get(target.id) ?? { target, coverage: wait.coverage, waitingJobs: 0 };
    group.waitingJobs += 1;
    groups.set(target.id, group);
  }
  return [...groups.values()];
}
