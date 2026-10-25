import type { RunCheckpointPage } from '@mmt/contracts';
import { executionApi } from '../api/execution';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

/** Runのcheckpoint。学習がまだ新しいものを保存しているかもしれない間は更新する。 */
export function useRunCheckpoints({
  projectId,
  runId,
  includeHidden,
}: {
  projectId: string;
  runId: string;
  includeHidden: boolean;
}): QueryState<RunCheckpointPage> {
  return useQuery({
    key: `${projectId}:${runId}:checkpoints:${includeHidden ? 'all' : 'retained'}`,
    load: (signal) => executionApi.listRunCheckpoints(projectId, runId, { includeHidden }, signal),
    pollMs: EXECUTION_POLL_MS,
  });
}
