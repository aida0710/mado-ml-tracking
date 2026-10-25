import { JOB_SUBMISSION_PHASES, type Job } from '@mmt/contracts';

/**
 * 止めるとJobがすぐ終わるときtrue（jobService.cancelOne）。待機中のJobか、投入中またはスケジューラの
 * 待ち行列で待っているsiteのJobがそれに当たる。ほかは要求が実行中のプロセスに届き、workerが止める
 * までJobは実行中のまま。
 */
export function cancelEndsAtOnce(job: Pick<Job, 'status' | 'phase'>): boolean {
  return job.status === 'queued' || (job.phase !== null && JOB_SUBMISSION_PHASES.includes(job.phase));
}
