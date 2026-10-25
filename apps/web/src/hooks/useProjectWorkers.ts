import { executionApi } from '../api/execution';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * ProjectのworkerをJobと同じようにポーリングしたもの。コンピュータにそのJobを引き受けるworkerが
 * いるかを出すすべての画面で使う（lib/workerCoverage）。ProjectのJobを取るのは、そのProjectの
 * workerだけ。
 */
export function useProjectWorkers(projectId: string) {
  return useQuery({
    key: `${projectId}:workers`,
    load: (signal) => executionApi.workers(projectId, signal),
    pollMs: EXECUTION_POLL_MS,
  });
}
