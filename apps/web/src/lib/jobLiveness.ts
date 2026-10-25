import type { Job } from '@mmt/contracts';

// heartbeatStaleはAPIが決める。古いポーリングの応答に載った終了済みのJobは、応答なしではない。
export function isJobUnresponsive(job: Pick<Job, 'status' | 'heartbeatStale'>): boolean {
  return job.heartbeatStale && (job.status === 'claimed' || job.status === 'running');
}
