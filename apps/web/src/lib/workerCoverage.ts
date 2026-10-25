import type { ComputeTarget, WorkerPresence } from '@mmt/contracts';

/**
 * コンピュータの作業を受け取るworkerがいるかどうか。画面が一覧にできるworkerから判断する。
 * - `notNeeded`: site。Jobは代わりにランチャーか`mado-tracking submit`が投入する。
 * - `online`: 担当のworkerのうち少なくとも1つが、直近2分以内に応答した。
 * - `offline`: 担当のworkerが応答しなくなった。`lastSeenAt`は最後の応答の時刻。
 * - `none`: このコンピュータを受け持つと言ったworkerが一度も無い。
 */
export type WorkerCoverage =
  | { state: 'notNeeded' }
  | { state: 'online'; onlineCount: number }
  | { state: 'offline'; lastSeenAt: string }
  | { state: 'none' };

type CoveredTarget = Pick<ComputeTarget, 'id' | 'executor'>;
type CoveringWorker = Pick<WorkerPresence, 'targetIds' | 'status' | 'lastSeenAt'>;

/**
 * workerは、tokenのProjectのJobを、MMT_WORKER_TARGET_IDSにあるコンピュータで受け取る。
 * 何も指定しなければ、すべてのコンピュータで受け取る（WorkerService.claim）。
 */
export const takesJobsOn = (worker: Pick<WorkerPresence, 'targetIds'>, targetId: string): boolean =>
  worker.targetIds === null || worker.targetIds.includes(targetId);

/**
 * workerを誰も選ばなかった接続確認は、MMT_WORKER_TARGET_IDSでそのコンピュータを指定した
 * workerへ行く。何も指定しないworkerは受け取らない（TargetCheckService）。
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
 * ProjectのworkerのうちコンピュータのJobを受け取るもの（GET /projects/:p/workers）。Projectの
 * Jobを受け取るのは、同じProjectのworkerだけ。
 */
export function jobWorkerCoverage(
  target: CoveredTarget,
  workers: readonly CoveringWorker[],
): WorkerCoverage {
  if (target.executor === 'site') return { state: 'notNeeded' };
  return coverageOf(workers.filter((worker) => takesJobsOn(worker, target.id)));
}

/** すべてのProjectのworkerのうち、コンピュータの接続確認を受け取るもの（GET /workers）。 */
export function checkWorkerCoverage(
  target: CoveredTarget,
  workers: readonly CoveringWorker[],
): WorkerCoverage {
  if (target.executor === 'site') return { state: 'notNeeded' };
  return coverageOf(workers.filter((worker) => takesChecksOf(worker, target.id)));
}

/** 今コンピュータに送ったJobや接続確認は、workerが起動するまで待つことになる。 */
export const isWorkerMissing = (coverage: WorkerCoverage): boolean =>
  coverage.state === 'offline' || coverage.state === 'none';
