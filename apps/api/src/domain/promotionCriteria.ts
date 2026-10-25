import type {
  EvaluationComparison,
  MetricComparison,
  PromotionCriterion,
  PromotionCriterionResult,
  PromotionDecision,
  PromotionEvaluationReason,
  PromotionMissingBaseline,
} from '@mmt/contracts';

export interface CriteriaJudgement {
  decision: Exclude<PromotionDecision, 'skipped'>;
  reason: PromotionEvaluationReason | null;
  criteriaResults: PromotionCriterionResult[];
}

type Outcome = Pick<PromotionCriterionResult, 'observed' | 'outcome' | 'reason'>;

const MISSING_METRIC: MetricComparison = {
  key: '',
  candidate: null,
  baseline: null,
  candidateStatus: 'missing',
  baselineStatus: 'missing',
  delta: null,
  relativeDelta: null,
  source: { candidate: null, baseline: null },
};

// deltaは浮動小数点で計算する（0.85 - 0.8 = 0.04999999999999993）ので、関わる値の大きさに
// 対してこれほど閾値に近い値は、ちょうど閾値上にあるとみなす。
const THRESHOLD_RELATIVE_TOLERANCE = 1e-12;

function meetsThreshold(criterion: PromotionCriterion, observed: number): boolean {
  const scale = Math.max(1, Math.abs(observed), Math.abs(criterion.threshold));
  if (Math.abs(observed - criterion.threshold) <= THRESHOLD_RELATIVE_TOLERANCE * scale) return true;
  return criterion.direction === 'higher'
    ? observed > criterion.threshold
    : observed < criterion.threshold;
}

function compared(criterion: PromotionCriterion, observed: number): Outcome {
  return { observed, outcome: meetsThreshold(criterion, observed) ? 'passed' : 'failed', reason: null };
}

function judgeAbsolute(criterion: PromotionCriterion, metric: MetricComparison): Outcome {
  if (metric.candidateStatus === 'missing')
    return { observed: null, outcome: 'failed', reason: 'candidate_metric_missing' };
  if (metric.candidateStatus === 'not_finite')
    return { observed: null, outcome: 'failed', reason: 'candidate_metric_not_finite' };
  return compared(criterion, metric.candidate!);
}

// deltaとrelative_deltaにはベースラインの値が要る。無いときの扱いは、無い理由で変わる。
function judgeAgainstBaseline(
  criterion: PromotionCriterion,
  judged: {
    metric: MetricComparison;
    status: EvaluationComparison['status'];
    missingBaseline: PromotionMissingBaseline;
  },
): Outcome {
  const { metric, status, missingBaseline } = judged;
  const candidate = judgeAbsolute(criterion, metric);
  if (candidate.reason) return candidate;
  if (status === 'baseline_missing')
    return {
      observed: null,
      outcome: missingBaseline === 'pass' ? 'passed' : 'failed',
      reason: 'baseline_missing',
    };
  if (status === 'baseline_not_evaluated')
    return { observed: null, outcome: 'insufficient', reason: 'baseline_not_evaluated' };
  if (metric.baselineStatus === 'missing')
    return { observed: null, outcome: 'failed', reason: 'baseline_metric_missing' };
  if (metric.baselineStatus === 'not_finite')
    return { observed: null, outcome: 'failed', reason: 'baseline_metric_not_finite' };
  if (criterion.mode === 'delta') return compared(criterion, metric.delta!);
  if (metric.relativeDelta === null)
    return { observed: null, outcome: 'failed', reason: 'baseline_zero' };
  return compared(criterion, metric.relativeDelta);
}

function overallDecision(
  results: readonly PromotionCriterionResult[],
  status: EvaluationComparison['status'],
): Pick<CriteriaJudgement, 'decision' | 'reason'> {
  const failed = results.filter((result) => result.outcome === 'failed');
  if (failed.length)
    return {
      decision: 'failed',
      reason: failed.some((result) => result.reason === 'baseline_missing')
        ? 'baseline_missing'
        : 'criteria_failed',
    };
  if (results.some((result) => result.outcome === 'insufficient'))
    return { decision: 'insufficient', reason: 'baseline_not_evaluated' };
  if (status === 'baseline_missing')
    return { decision: 'passed', reason: 'baseline_missing_first_promotion' };
  return { decision: 'passed', reason: null };
}

/**
 * ポリシーの基準をベースラインとの比較に当てはめる。NaN、±Infinity、欠けたメトリクスは、
 * 飛ばさずに理由を付けて基準を不合格にする。絶対値の基準はベースラインが要らず、最初のリリース
 * でも確かめる。ベースラインのバージョンが無ければ、ベースラインに対する基準は
 * missingBaselineに従う（'pass'ならbaseline_missing_first_promotionを記録する）。
 */
export function evaluateCriteria(
  comparison: Pick<EvaluationComparison, 'status' | 'metrics'>,
  criteria: readonly PromotionCriterion[],
  missingBaseline: PromotionMissingBaseline,
): CriteriaJudgement {
  if (comparison.status === 'candidate_not_evaluated')
    return { decision: 'insufficient', reason: 'candidate_not_evaluated', criteriaResults: [] };
  const metrics = new Map(comparison.metrics.map((metric) => [metric.key, metric]));
  const criteriaResults = criteria.map((criterion): PromotionCriterionResult => {
    const metric = metrics.get(criterion.metric) ?? { ...MISSING_METRIC, key: criterion.metric };
    const outcome =
      criterion.mode === 'absolute'
        ? judgeAbsolute(criterion, metric)
        : judgeAgainstBaseline(criterion, { metric, status: comparison.status, missingBaseline });
    return {
      ...criterion,
      candidate: metric.candidate,
      baseline: metric.baseline,
      candidateStatus: metric.candidateStatus,
      baselineStatus: metric.baselineStatus,
      ...outcome,
    };
  });
  return { ...overallDecision(criteriaResults, comparison.status), criteriaResults };
}
