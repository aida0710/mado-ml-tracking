import type { Job } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { useQuery, type QueryState } from './useQuery';

/**
 * Runを実行したJob（Runをもう一度キューに入れたときは最新のもの）。Jobの無いRunならnull。
 * `enabled`で、必要になるまで問い合わせない。
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
