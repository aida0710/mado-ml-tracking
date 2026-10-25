import type { MetricValueStatus } from './evaluation.js';

// 1つのpolicyの条件の数の上限。model_promotion_policiesのCHECKと同じ。
export const PROMOTION_CRITERIA_MAX = 50;

export type PromotionCriterionDirection = 'higher' | 'lower';
export type PromotionCriterionMode = 'absolute' | 'delta' | 'relative_delta';

/**
 * 合格の条件1つ。observedの値はmodeで決まる。absoluteでは候補の値、deltaでは
 * candidate − baseline、relative_deltaでは(candidate − baseline) ÷ |baseline|。
 * directionが'higher'ならobserved ≥ thresholdで、'lower'ならobserved ≤ thresholdで合格する。
 * しきい値ちょうどは、どちらの向きでも合格する。
 */
export interface PromotionCriterion {
  metric: string;
  direction: PromotionCriterionDirection;
  mode: PromotionCriterionMode;
  threshold: number;
}

/** baselineのaliasがどのバージョンも指していないとき（最初のリリース）にpolicyが下す判定。 */
export type PromotionMissingBaseline = 'pass' | 'fail';

/**
 * 自動実行ルールevaluationRuleIdがmodelIdについて作った評価のRunを判定する。参照セットと評価の
 * CodeVersionは、そのルールの固定の入力とコードバージョン。設定は変えられず、変えられるのは
 * enabledと所有者（runAsUserId）だけ。autoPromoteがあれば、合格した自動の判定がtargetAliasを
 * 動かす。ただし、baselineが判定で比べたバージョンのままである間に限る。
 */
export interface PromotionPolicy {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  modelId: string;
  targetAlias: string;
  baselineAlias: string;
  evaluationRuleId: string;
  criteria: PromotionCriterion[];
  missingBaseline: PromotionMissingBaseline;
  autoPromote: boolean;
  createdBy: string;
  /**
   * policyがその人として動くユーザー。判定のたびに、今もProject adminの権限を持つかを確かめ、
   * 自動の昇格の実行者もこのユーザーになる。最初はcreatedByで、Project adminは、adminのroleを
   * 持つProjectの有効なService Accountに移せる。
   */
  runAsUserId: string;
  // 表示用の、runAsUserIdが誰かを示す値。policyの一覧には入るが、ほかの応答には無いことがある。
  runAsKind?: 'human' | 'service';
  runAsName?: string;
  createdAt: string;
}

/** PUT /projects/:p/promotion-policies/:id/ownerの本文。 */
export interface PromotionPolicyOwnerTransfer {
  serviceAccountId: string;
}

export interface PromotionPolicyCreate {
  name: string;
  enabled?: boolean;
  modelId: string;
  targetAlias: string;
  /** 既定はDEFAULT_BASELINE_ALIAS（'production'）。 */
  baselineAlias?: string;
  evaluationRuleId: string;
  criteria: PromotionCriterion[];
  missingBaseline?: PromotionMissingBaseline;
  autoPromote?: boolean;
}

export interface PromotionPolicyPatch {
  enabled: boolean;
}

/**
 * passed・failed: すべての条件を判定できた（または最初のリリースの決まりを当てはめた）。
 * insufficient: 必要な評価が無い。たとえばbaselineのバージョンに、policyのルールによる評価が
 * 無い。skipped: policyが判定できなかった（run-asのユーザーがProject adminでなくなった、または
 * 判定でエラーが起きた）。
 */
export type PromotionDecision = 'passed' | 'failed' | 'insufficient' | 'skipped';

export type PromotionCriterionOutcome = 'passed' | 'failed' | 'insufficient';

/**
 * 条件をそのまま比べられなかった理由。candidate_metric_missing、candidate_metric_not_finite、
 * baseline_metric_missing、baseline_metric_not_finite、baseline_zero（0に対するrelative_delta）、
 * baseline_missing（baselineのバージョンが無い。outcomeはmissingBaselineに従う）、
 * baseline_not_evaluated。observedの値をthresholdと比べたときはnull。
 */
export type PromotionCriterionReason =
  | 'candidate_metric_missing'
  | 'candidate_metric_not_finite'
  | 'baseline_metric_missing'
  | 'baseline_metric_not_finite'
  | 'baseline_zero'
  | 'baseline_missing'
  | 'baseline_not_evaluated';

export interface PromotionCriterionResult extends PromotionCriterion {
  candidate: number | null;
  baseline: number | null;
  candidateStatus: MetricValueStatus;
  baselineStatus: MetricValueStatus;
  /** thresholdと比べた値（PromotionCriterionを参照）。計算できなかったときはnull。 */
  observed: number | null;
  outcome: PromotionCriterionOutcome;
  reason: PromotionCriterionReason | null;
}

/**
 * 判定全体がその結果になった理由。baseline_missing_first_promotion（baselineのバージョンが
 * 無く、missingBaseline='pass'なので合格）、baseline_missing、criteria_failed、
 * candidate_not_evaluated、baseline_not_evaluated、creator_access_revoked（run-asのユーザーが
 * もうProject adminではない）、evaluation_error。autoPromoteのpolicyで合格したのに昇格しなかった
 * 判定では、baseline_changed（判定が読んだあとでbaselineか対象のaliasが動いた）か
 * promotion_denied（aliasの変更が、aliasの保護などで拒まれた）。普通の合格ではnull。
 */
export type PromotionEvaluationReason =
  | 'baseline_missing_first_promotion'
  | 'baseline_missing'
  | 'criteria_failed'
  | 'candidate_not_evaluated'
  | 'baseline_not_evaluated'
  | 'creator_access_revoked'
  | 'evaluation_error'
  | 'baseline_changed'
  | 'promotion_denied';

/** aliasが未設定でbaselineが無かった、合格の判定に記録する理由。 */
export const PROMOTION_FIRST_RELEASE_REASON: PromotionEvaluationReason = 'baseline_missing_first_promotion';

/** 追記だけの判定1件。同じ候補のRunを判定し直すと、sequenceが1増える。 */
export interface PromotionEvaluation {
  id: string;
  projectId: string;
  policyId: string;
  modelId: string;
  candidateVersionId: string;
  candidateRunId: string;
  baselineVersionId: string | null;
  baselineRunId: string | null;
  decision: PromotionDecision;
  criteriaResults: PromotionCriterionResult[];
  reason: PromotionEvaluationReason | null;
  /** この判定がtargetAliasを動かしたか（自動の昇格）。aliasEventIdはその変更。 */
  promoted: boolean;
  aliasEventId: string | null;
  sequence: number;
  /** 評価のRunが終わったときの自動の判定ではnull。 */
  requestedBy: string | null;
  createdAt: string;
}

/** 判定のkeysetページングの1ページ（新しい順）。nextCursorは次に`cursor`として渡すid。 */
export interface PromotionEvaluationPage {
  items: PromotionEvaluation[];
  nextCursor: string | null;
}
