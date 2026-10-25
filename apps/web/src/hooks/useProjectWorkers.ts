import { executionApi } from '../api/execution';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * The Project's workers, polled like the Jobs, for every screen that says whether a computer has
 * a worker to take its Jobs (lib/workerCoverage). Only workers of the Project claim its Jobs.
 */
export function useProjectWorkers(projectId: string) {
  return useQuery({
    key: `${projectId}:workers`,
    load: (signal) => executionApi.workers(projectId, signal),
    pollMs: EXECUTION_POLL_MS,
  });
}
