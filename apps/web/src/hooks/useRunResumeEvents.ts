import type { RunStatus } from '@mmt/contracts';
import { metricSeriesApi } from '../api/metricSeries';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * Polls while the Run runs, since a running Run can end and be resumed again. readAt is when the
 * segments were read: a segment still running is drawn up to that moment.
 */
export function useRunResumeEvents(projectId: string, runId: string, status: RunStatus | undefined) {
  return useQuery({
    key: runId ? `${projectId}:run:${runId}:resume-events` : null,
    load: async (signal) => ({ ...(await metricSeriesApi.resumeEvents(projectId, runId, signal)), readAt: Date.now() }),
    pollMs: status === 'running' ? EXECUTION_POLL_MS : undefined,
  });
}
