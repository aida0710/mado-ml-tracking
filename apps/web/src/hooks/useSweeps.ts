import { MAX_SERIES_RUNS, type Sweep, type SweepStatus, type SweepTrial } from '@mmt/contracts';
import { sweepsApi } from '../api/sweeps';
import { tasksApi } from '../api/tasks';
import { isSweepActive } from '../lib/sweepTrials';
import { useCursorPages } from './useCursorPages';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';
import { useQueryPolledWhileActive } from './useQueryPolledWhileActive';

/** ProjectのSweepを新しい順に、状態で絞り込み、ページごとに読む。 */
export function useSweepList(projectId: string, status: SweepStatus | '') {
  return useCursorPages(`${projectId}:sweeps:${status}`, (cursor, signal) =>
    sweepsApi.list(projectId, { status: status || undefined, cursor, signal }),
  );
}

export interface SweepDetail {
  sweep: Sweep;
  trials: SweepTrial[];
}

/** Sweepとそのすべての試行。試行がまだ変わりうる間は、まとめてポーリングする。 */
export function useSweepDetail(projectId: string, sweepId: string) {
  return useQueryPolledWhileActive<SweepDetail>(
    `${projectId}:sweep:${sweepId}`,
    async (signal) => {
      const [sweep, trials] = await Promise.all([
        sweepsApi.get(projectId, sweepId, signal),
        sweepsApi.allTrials(projectId, sweepId, signal),
      ]);
      return { sweep, trials };
    },
    (detail) => isSweepActive(detail.sweep),
  );
}

/**
 * 新しい試行のRunの、stepごとの目的メトリクス。APIは1回の要求でMAX_SERIES_RUNS個のRunまで
 * 受け付けるので、それより大きいSweepは新しい試行を出す。キーは試行の状態に従うので、動きの無い
 * Sweepをポーリングしなくても、新しく終わった試行が描かれる。
 */
export function useTrialObjectiveSeries(projectId: string, detail: SweepDetail | undefined) {
  const shownTrials = detail ? [...detail.trials].sort((left, right) => right.trialIndex - left.trialIndex).slice(0, MAX_SERIES_RUNS) : [];
  const stateKey = shownTrials.map((trial) => `${trial.trialIndex}:${trial.state}`).join(',');
  const isActive = detail ? isSweepActive(detail.sweep) : false;
  const series = useQuery({
    key: detail && shownTrials.length ? `${projectId}:sweep-series:${detail.sweep.id}:${stateKey}` : null,
    load: (signal) =>
      sweepsApi.objectiveSeries(projectId, {
        runIds: shownTrials.map((trial) => trial.runId),
        metric: detail!.sweep.objective.metric,
        signal,
      }),
    pollMs: isActive ? EXECUTION_POLL_MS : undefined,
  });
  return { series, shownTrials, totalTrials: detail?.trials.length ?? 0 };
}

// メトリクス名はTaskの最新のRunから取る。候補を出すには履歴の1ページで足りる。
export function useTaskMetricNames(projectId: string, taskId: string) {
  return useQuery({ key: taskId ? `${projectId}:task-metric-names:${taskId}` : null, load: async (signal) => {
    const page = await tasksApi.runs(projectId, taskId, { signal });
    return [...new Set(page.items.flatMap((run) => Object.keys(run.latestMetrics)))].sort();
  } });
}
