import type { MediaCompareGrid, Run, RunMediaKeySummary } from '@mmt/contracts';
import { runMediaApi } from '../api/runMedia';
import { trackingApi } from '../api/tracking';
import { defaultComparisonSteps } from '../lib/mediaCompareSteps';
import { sortedSteps } from '../lib/mediaSteps';
import { useQuery, type QueryState } from './useQuery';

export interface MediaCompareChoices {
  runs: Run[];
  /** 比べるRunの少なくとも1つが記録したキー。名前ごと。 */
  keys: RunMediaKeySummary[];
}

/** 各Runのキーの要約をキーごとに1つにまとめる（件数は足し、stepの範囲は広げる）。 */
function mergeKeySummaries(summariesByRun: RunMediaKeySummary[][]): RunMediaKeySummary[] {
  const merged = new Map<string, RunMediaKeySummary>();
  for (const summary of summariesByRun.flat()) {
    const existing = merged.get(summary.key);
    merged.set(
      summary.key,
      existing
        ? {
            ...existing,
            count: existing.count + summary.count,
            minStep: Math.min(existing.minStep, summary.minStep),
            maxStep: Math.max(existing.maxStep, summary.maxStep),
          }
        : summary,
    );
  }
  return [...merged.values()].sort((left, right) => left.key.localeCompare(right.key));
}

interface MediaCompareTarget {
  projectId: string;
  runIds: string[];
  chosenKey: string | null;
}

/**
 * メディアの比較の材料。Run、そのどれかが記録したキー、選んだキー（選ばれたもの、無ければ最初の
 * もの）について各Runが記録したstep。runIdsの順。
 */
export function useMediaCompareChoices({ projectId, runIds, chosenKey }: MediaCompareTarget): {
  choices: QueryState<MediaCompareChoices>;
  selectedKey: string | null;
  stepsByRun: QueryState<number[][]>;
} {
  const runKey = runIds.join(',');
  const choices = useQuery({ key: `${projectId}:media-compare-choices:${runKey}`, load: async (signal) => {
    const [runs, summaries] = await Promise.all([
      Promise.all(runIds.map((runId) => trackingApi.run(projectId, runId, signal))),
      Promise.all(runIds.map((runId) => runMediaApi.keys(projectId, runId, signal))),
    ]);
    return { runs, keys: mergeKeySummaries(summaries) };
  } });
  const key = chosenKey ?? choices.value?.keys[0]?.key ?? null;
  const stepsByRun = useQuery({ key: key === null ? null : `${projectId}:media-compare-steps:${runKey}:${key}`, load: async (signal) => {
    const lists = await Promise.all(runIds.map((runId) => runMediaApi.list(projectId, runId, { key: key! }, signal)));
    return lists.map((list) => sortedSteps(list.items.map((item) => item.step)));
  } });
  return { choices, selectedKey: key, stepsByRun };
}

/**
 * 選択肢と、POST /media/compareによるRun × stepの格子。`steps`がnullなら既定の列を求めるので、
 * 格子は列を選ぶのに記録済みのstepを待つ。[]なら各Runの最新のstepを求める。`shownSteps`は格子に
 * 求めたもので、分かるまではnull。
 */
export function useMediaCompare({ steps, ...target }: MediaCompareTarget & { steps: number[] | null }): ReturnType<
  typeof useMediaCompareChoices
> & {
  shownSteps: number[] | null;
  grid: QueryState<MediaCompareGrid>;
} {
  const { choices, selectedKey, stepsByRun } = useMediaCompareChoices(target);
  const shownSteps = steps ?? (stepsByRun.value ? defaultComparisonSteps(stepsByRun.value) : null);
  const { projectId, runIds } = target;
  const grid = useQuery({
    key: selectedKey === null || shownSteps === null
      ? null
      : `${projectId}:media-compare:${runIds.join(',')}:${selectedKey}:${shownSteps.join(',')}`,
    load: (signal) =>
      runMediaApi.compare(
        projectId,
        { runIds, key: selectedKey!, ...(shownSteps!.length > 0 ? { steps: shownSteps! } : {}) },
        signal,
      ),
  });
  return { choices, selectedKey, stepsByRun, shownSteps, grid };
}
