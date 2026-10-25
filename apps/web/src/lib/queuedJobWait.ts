import type { ComputeTarget, JobListItem, WorkerCapability, WorkerPresence } from '@mmt/contracts';
import {
  isWorkerMissing,
  jobWorkerCoverage,
  takesJobsOn,
  type WorkerCoverage,
} from './workerCoverage';

/**
 * 待機中のsshまたはlocalのJobが始まっていない理由:
 * - `worker`: そのコンピュータを受け持つProjectのworkerが無いか、応答しなくなった。workerが
 *   動き出すまで始まらない。
 * - `workerUpdate`: workerは応答しているが、そのコンピュータを受け持つオンラインのworkerの
 *   どれも、Jobに要る機能のすべてには対応していない（ワークフローのステップより前のものなど、
 *   古いworker）。APIは対応するworkerにだけJobを渡すので、workerを更新すれば始まる。
 * - `notTaken`: workerは応答しているが、Jobを受け取っていない。worker側のどの理由に当たるか
 *   （コンピュータが埋まっているか無効、GPUが使われている、コードのRuntimeを扱えない、APIの
 *   local executorが無効）は画面からは分からないので、それらを並べる。
 * ほかのJobはすべてnull。siteのJobは、どこにいるかをphaseで示す。
 */
export type QueuedJobWait =
  | { kind: 'worker'; coverage: WorkerCoverage }
  | { kind: 'workerUpdate'; missingCapabilities: WorkerCapability[] }
  | { kind: 'notTaken' };

type WaitingJob = Pick<JobListItem, 'status' | 'targetId' | 'requiredWorkerCapabilities'>;
type JobTarget = Pick<ComputeTarget, 'id' | 'name' | 'executor'>;
type ProjectWorker = Pick<WorkerPresence, 'targetIds' | 'status' | 'lastSeenAt' | 'capabilities'>;

/**
 * Jobに要る機能のうち、そのコンピュータのオンラインのworkerのどれもがJobを受け取れない原因に
 * なっているもの。どれか1つのworkerがすべてに対応していれば空。
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

/** workerを待つ待機中のJobを、コンピュータごとに、コンピュータが最初に現れた順でまとめる。 */
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
