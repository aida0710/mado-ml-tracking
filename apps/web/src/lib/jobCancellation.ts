import { JOB_SUBMISSION_PHASES, type Job } from '@mmt/contracts';

/**
 * True when stopping ends the Job right away (jobService.cancelOne): it is queued, or a site Job
 * still being submitted or waiting in the scheduler queue. Otherwise the request reaches the
 * running process and the Job stays running until the worker stops it.
 */
export function cancelEndsAtOnce(job: Pick<Job, 'status' | 'phase'>): boolean {
  return job.status === 'queued' || (job.phase !== null && JOB_SUBMISSION_PHASES.includes(job.phase));
}
