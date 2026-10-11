import { useState } from 'react';
import { MAX_RUN_LOG_TAIL } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';

/**
 * The lines a log view polls: enough to read a failure and its traceback, small enough to fetch
 * every few seconds (3,000 lines were about 450 KB). Older lines come on request.
 */
export const RUN_LOG_TAIL_LINES = 2000;

/**
 * A Run's log for the Jobs page and the Run's Logs tab. It shows the latest lines, read again
 * every few seconds while the Run can still write (`isLive`); a finished Run's log is read once.
 * On request it reads as many latest lines as one read returns (MAX_RUN_LOG_TAIL), once: polling
 * that many would fetch megabytes every few seconds. Every line is in the download link.
 */
export function useRunLogs({
  projectId,
  run,
  enabled,
  isLive,
}: {
  projectId: string;
  run: { id: string } | undefined;
  enabled: boolean;
  isLive: boolean;
}) {
  // Remembered per Run, so choosing another Job starts from its latest lines again.
  const [moreLinesRunId, setMoreLinesRunId] = useState<string | null>(null);
  const runId = run?.id;
  const readsMoreLines = runId !== undefined && moreLinesRunId === runId;
  const lines = useQuery(
    enabled && runId ? `${projectId}:${runId}:logs:${readsMoreLines ? 'more' : 'latest'}` : null,
    (signal) =>
      trackingApi.logs(projectId, runId!, {
        tail: readsMoreLines ? MAX_RUN_LOG_TAIL : RUN_LOG_TAIL_LINES,
        signal,
      }),
    // Leaving the poll reads once more, so the lines a Run wrote as it ended are shown.
    isLive && !readsMoreLines ? EXECUTION_POLL_MS : undefined,
  );
  return {
    lines,
    isLive,
    readsMoreLines,
    readMoreLines: () => setMoreLinesRunId(runId ?? null),
    /** Back to the latest lines, read again every few seconds while the Run is live. */
    followLatestLines: () => setMoreLinesRunId(null),
    downloadUrl: runId ? trackingApi.runLogFileUrl(projectId, runId) : undefined,
  };
}

export type RunLogsState = ReturnType<typeof useRunLogs>;
