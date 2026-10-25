import type { Job } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { useQuery, type QueryState } from './useQuery';

/**
 * The Job that ran a Run (its newest, when the Run was enqueued again), or null for a Run that has
 * none. `enabled` keeps the lookup off until it is needed.
 */
export function useRunJob({
  projectId,
  runId,
  enabled,
}: {
  projectId: string;
  runId: string;
  enabled: boolean;
}): QueryState<Job | null> {
  return useQuery({
    key: enabled ? `${projectId}:run-job:${runId}` : null,
    load: async (signal) => (await executionApi.runJobs(projectId, runId, signal))[0] ?? null,
  });
}
