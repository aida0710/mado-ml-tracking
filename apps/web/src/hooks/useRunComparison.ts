import { useState } from 'react';
import type { RunComparison, RunStatus } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { isComparableRunCount } from '../lib/comparisonRows';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

const activeStatuses: readonly RunStatus[] = ['queued', 'running'];

/**
 * 1回のAPI呼び出しで得るRunの比較。比べるRunのどれかがまだ変わりうる間は更新し、すべてが
 * 終わったら止める。
 */
export function useRunComparison(comparison: {
  projectId: string;
  runIds: string[];
  baselineRunId: string | null;
}): QueryState<RunComparison> {
  const { projectId, runIds, baselineRunId } = comparison;
  const key = isComparableRunCount(runIds.length)
    ? `${projectId}:run-comparison:${runIds.join(',')}:${baselineRunId ?? ''}`
    : null;
  const loader = (signal: AbortSignal) =>
    trackingApi.compareRuns(
      projectId,
      {
        runIds,
        ...(baselineRunId ? { baselineRunId } : {}),
      },
      signal,
    );
  const [pollMs, setPollMs] = useState<number | undefined>(EXECUTION_POLL_MS);
  const query = useQuery({ key, load: loader, pollMs });
  // 応答からだけ決めるので、別の基準Runのための読み直しでも今の間隔を保つ。
  const hasActiveRuns = query.value
    ? query.value.runs.some((run) => activeStatuses.includes(run.status))
    : null;
  const decidedPollMs = hasActiveRuns === null ? pollMs : hasActiveRuns ? EXECUTION_POLL_MS : undefined;
  if (decidedPollMs !== pollMs) setPollMs(decidedPollMs);
  return query;
}
