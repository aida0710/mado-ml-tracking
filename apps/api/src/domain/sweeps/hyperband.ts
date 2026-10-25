// ASHA（Asynchronous Successive Halving）式の非同期 Hyperband。
// 同期式の Hyperband は bracket の全試行が rung に揃うまで待つが、Sweep の試行は worker ごとにばらばらに進むため、
// 各試行が rung に達した時点で、その rung に既に達した試行とだけ比べて止めるかを決める。
import type { ApiErrorDetails, SweepEarlyTerminateViolation } from '@mmt/contracts';
import { DomainError } from '../errors.js';
import { compareTrialsByObjective } from './trialObjective.js';
import type { EarlyStoppingConfig, MetricPoint, SweepGoal } from './types.js';

export interface PeerProgress {
  trialIndex: number;
  objectiveHistory: readonly MetricPoint[];
}

export interface ShouldStopInput {
  trialIndex: number;
  objectiveHistory: readonly MetricPoint[];
  /** 同じ Sweep のほかの試行（終わった試行も含める）。trialIndex が同じものは無視する */
  peers: readonly PeerProgress[];
  goal: SweepGoal;
  config: EarlyStoppingConfig;
}

/**
 * before_first_rung: 最初の rung の step に達していない
 * not_enough_peers: rung に達した試行が eta 未満で、比べるには早すぎる
 * no_objective: rung の時点の値が NaN か無い（補完して判定しない）
 * within_rung_cutoff: 上位 1/eta に入った
 * below_rung_cutoff: 上位 1/eta に入らなかったので止める
 */
export type ShouldStopReason =
  | 'before_first_rung'
  | 'not_enough_peers'
  | 'no_objective'
  | 'within_rung_cutoff'
  | 'below_rung_cutoff';

export interface ShouldStopResult {
  stop: boolean;
  rung?: number;
  reason: ShouldStopReason;
}

/** 違反の理由と、文に入る値を横の項目にして 422 sweep_early_terminate_invalid を投げる。 */
function invalid(reason: SweepEarlyTerminateViolation, message: string, details: ApiErrorDetails): never {
  throw new DomainError({
    status: 422,
    code: 'sweep_early_terminate_invalid',
    message,
    details: { reason, ...details },
  });
}

export function validateEarlyStoppingConfig(config: EarlyStoppingConfig): void {
  if (config.type !== 'hyperband')
    invalid('type_unsupported', `early_terminate type "${String(config.type)}" is not supported`, {
      type: String(config.type),
    });
  if (!Number.isFinite(config.minIter) || config.minIter <= 0)
    invalid('min_iter_positive', `early_terminate minIter must be a positive number (minIter=${config.minIter})`, {
      minIter: String(config.minIter),
    });
  if (!Number.isInteger(config.eta) || config.eta < 2)
    invalid('eta_integer', `early_terminate eta must be an integer of 2 or more (eta=${config.eta})`, {
      eta: String(config.eta),
    });
  if (config.maxIter !== undefined && (!Number.isFinite(config.maxIter) || config.maxIter <= config.minIter))
    invalid('max_iter_order', `early_terminate maxIter must be greater than minIter (maxIter=${config.maxIter})`, {
      maxIter: String(config.maxIter),
    });
}

/**
 * step が upToStep 以下の rung（minIter×eta^k）。maxIter を指定したときは maxIter 未満の rung だけにする
 * （maxIter に達した試行は予定の step を使い切っており、止めても計算を節約できないため）。
 */
export function hyperbandRungs(config: EarlyStoppingConfig, upToStep: number): number[] {
  const rungs: number[] = [];
  for (let rung = config.minIter; rung <= upToStep; rung *= config.eta) {
    if (config.maxIter !== undefined && rung >= config.maxIter) break;
    rungs.push(rung);
  }
  return rungs;
}

function lastStep(history: readonly MetricPoint[]): number {
  return history.reduce((latest, point) => Math.max(latest, point.step), -Infinity);
}

/** rung の時点の値: step が rung 以下で最後に記録した値。NaN は null */
function valueAtRung(history: readonly MetricPoint[], rung: number): number | null {
  let atRung: MetricPoint | undefined;
  for (const point of history) if (point.step <= rung && (atRung === undefined || point.step >= atRung.step)) atRung = point;
  return atRung !== undefined && Number.isFinite(atRung.value) ? atRung.value : null;
}

/**
 * 試行が達した最も高い rung で、その rung に達した試行（自分を含む）の上位 floor(n/eta) 件に入らなければ止める。
 * 到達した試行が eta 未満の rung では止めない（最初の数件だけで比べると、良い試行を早すぎる段階で止めてしまう）。
 */
export function shouldStop({ trialIndex, objectiveHistory, peers, goal, config }: ShouldStopInput): ShouldStopResult {
  const rung = hyperbandRungs(config, lastStep(objectiveHistory)).at(-1);
  if (rung === undefined) return { stop: false, reason: 'before_first_rung' };
  const objective = valueAtRung(objectiveHistory, rung);
  if (objective === null) return { stop: false, rung, reason: 'no_objective' };

  const reached = [{ trialIndex, objective }];
  for (const peer of peers) {
    if (peer.trialIndex === trialIndex || lastStep(peer.objectiveHistory) < rung) continue;
    const peerObjective = valueAtRung(peer.objectiveHistory, rung);
    if (peerObjective !== null) reached.push({ trialIndex: peer.trialIndex, objective: peerObjective });
  }
  if (reached.length < config.eta) return { stop: false, rung, reason: 'not_enough_peers' };

  const keepCount = Math.floor(reached.length / config.eta);
  const rank = reached.sort(compareTrialsByObjective(goal)).findIndex((entry) => entry.trialIndex === trialIndex);
  return rank < keepCount
    ? { stop: false, rung, reason: 'within_rung_cutoff' }
    : { stop: true, rung, reason: 'below_rung_cutoff' };
}
