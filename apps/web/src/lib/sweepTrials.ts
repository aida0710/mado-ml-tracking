import type { Sweep, SweepObjective, SweepStatus, SweepTrial } from '@mmt/contracts';
import { countGridCombinations } from './sweepConfig';

// Sweepの詳細が試行から求める値（進み具合の図、試行の並び順、画面にまだポーリングが要るか）。
// テストできるよう、コンポーネントから分けておく。

const ENDED_STATUSES: readonly SweepStatus[] = ['finished', 'canceled', 'failed'];

/** finished・canceled・failedのSweepは、一時停止・再開・取消・上限の変更を受け付けない（409 sweep_finished）。 */
export function isSweepEnded(sweep: Pick<Sweep, 'status'>): boolean {
  return ENDED_STATUSES.includes(sweep.status);
}

/**
 * Sweepが始める試行の数。maxTrials、またはgridの組み合わせのほうが少なければその数
 * （組み合わせをすべて実行したら終わる）。
 */
export function plannedTrialCount(
  sweep: Pick<Sweep, 'method' | 'maxTrials' | 'searchSpace'>,
): number {
  if (sweep.method !== 'grid') return sweep.maxTrials;
  const combinations = countGridCombinations(sweep.searchSpace);
  return combinations === null ? sweep.maxTrials : Math.min(sweep.maxTrials, combinations);
}

/** 試行をキューに入れる可能性があるか、まだ実行中の試行がある間は、Sweepは変わり続ける。 */
export function isSweepActive(sweep: Pick<Sweep, 'status' | 'trialCounts'>): boolean {
  return sweep.status === 'running' || sweep.trialCounts.queued + sweep.trialCounts.running > 0;
}

const isBetter = (goal: SweepObjective['goal'], candidate: number, current: number) =>
  goal === 'minimize' ? candidate < current : candidate > current;

export interface ObjectiveProgressPoint {
  trialIndex: number;
  objective: number;
  /** この試行とそれより前の試行の中で最良の目的値。最良に数えられる試行が出るまではnull。 */
  bestSoFar: number | null;
}

/**
 * 目的値を持つ試行を試行の順に並べたもの。最良に数えるのはfinishedとearly_stoppedの試行だけで、
 * APIのbestTrialに合わせる。failedやcanceledの値は途中で打ち切られたもの。
 */
export function objectiveProgress(trials: SweepTrial[], goal: SweepObjective['goal']): ObjectiveProgressPoint[] {
  const points: ObjectiveProgressPoint[] = [];
  let best: number | null = null;
  for (const trial of [...trials].sort((left, right) => left.trialIndex - right.trialIndex)) {
    if (trial.objectiveValue === null) continue;
    if ((trial.state === 'finished' || trial.state === 'early_stopped') && (best === null || isBetter(goal, trial.objectiveValue, best)))
      best = trial.objectiveValue;
    points.push({ trialIndex: trial.trialIndex, objective: trial.objectiveValue, bestSoFar: best });
  }
  return points;
}

export type SweepTrialOrder = 'trial_index' | 'objective';

/** APIのorderByの規則。objectiveはgoalに沿って最良のものから並べ、目的値の無い試行は最後。 */
export function sortTrials(trials: SweepTrial[], order: SweepTrialOrder, goal: SweepObjective['goal']): SweepTrial[] {
  return [...trials].sort((left, right) => {
    if (order === 'objective') {
      if (left.objectiveValue !== right.objectiveValue) {
        if (left.objectiveValue === null) return 1;
        if (right.objectiveValue === null) return -1;
        return goal === 'minimize' ? left.objectiveValue - right.objectiveValue : right.objectiveValue - left.objectiveValue;
      }
    }
    return left.trialIndex - right.trialIndex;
  });
}

/** 試行の表の列にする、全試行のパラメータ名（名前順）。 */
export function trialParameterNames(trials: SweepTrial[]): string[] {
  return [...new Set(trials.flatMap((trial) => Object.keys(trial.parameters)))].sort();
}
