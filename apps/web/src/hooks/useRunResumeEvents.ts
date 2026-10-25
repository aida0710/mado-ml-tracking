import type { RunStatus } from '@mmt/contracts';
import { metricSeriesApi } from '../api/metricSeries';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * 実行中のRunは終わってからまた再開されることがあるので、Runが実行中の間はポーリングする。readAtは
 * 区間を読んだ時刻で、まだ実行中の区間はその時刻まで描く。
 */
export function useRunResumeEvents(projectId: string, runId: string, status: RunStatus | undefined) {
  return useQuery({
    key: runId ? `${projectId}:run:${runId}:resume-events` : null,
    load: async (signal) => ({ ...(await metricSeriesApi.resumeEvents(projectId, runId, signal)), readAt: Date.now() }),
    pollMs: status === 'running' ? EXECUTION_POLL_MS : undefined,
  });
}
