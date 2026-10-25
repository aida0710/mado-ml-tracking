import {
  DEFAULT_BASELINE_ALIAS,
  PROMOTION_CRITERIA_MAX,
  type Model,
  type ModelAutomationRule,
  type PromotionCriterion,
  type PromotionCriterionDirection,
  type PromotionCriterionMode,
  type PromotionMissingBaseline,
  type PromotionPolicyCreate,
} from '@mmt/contracts';
import { LocalizedError } from './localizedError';
import { promotionTextTemplates } from '../i18n/promotion';
import { memoizePerIntlLocale } from '../i18n/intlFormatterCache';
import { text } from '../i18n/catalog';

export const PROMOTION_DIRECTIONS: PromotionCriterionDirection[] = ['higher', 'lower'];
export const PROMOTION_MODES: PromotionCriterionMode[] = ['absolute', 'delta', 'relative_delta'];
export const PROMOTION_MISSING_BASELINE_CHOICES: PromotionMissingBaseline[] = ['pass', 'fail'];

/** 編集できる合否基準の1行。thresholdは、policyを保存するまで入力した文字列のまま持つ。 */
export interface PromotionCriterionDraft {
  // 変わらないReactのkey。一覧の途中の行を消せるため。
  key: string;
  metric: string;
  direction: PromotionCriterionDirection;
  mode: PromotionCriterionMode;
  threshold: string;
}

export interface PromotionPolicyDraft {
  name: string;
  enabled: boolean;
  modelId: string;
  targetAlias: string;
  baselineAlias: string;
  evaluationRuleId: string;
  criteria: PromotionCriterionDraft[];
  missingBaseline: PromotionMissingBaseline;
  autoPromote: boolean;
}

let nextCriterionKey = 0;
export function createCriterionDraft(): PromotionCriterionDraft {
  nextCriterionKey += 1;
  return {
    key: `criterion-${nextCriterionKey}`,
    metric: '',
    direction: 'higher',
    mode: 'delta',
    threshold: '0',
  };
}

// 候補はたいてい基準を置き換えるので、両方のaliasを比較の既定値で始める。
export function createPromotionPolicyDraft(modelId: string): PromotionPolicyDraft {
  return {
    name: '',
    enabled: true,
    modelId,
    targetAlias: DEFAULT_BASELINE_ALIAS,
    baselineAlias: DEFAULT_BASELINE_ALIAS,
    evaluationRuleId: '',
    criteria: [createCriterionDraft()],
    missingBaseline: 'pass',
    autoPromote: false,
  };
}

/** 自動のRunでこのモデルのバージョンを判定できる評価ルール。 */
export function isEvaluationRuleEligible(rule: ModelAutomationRule, model: Model): boolean {
  return rule.kind === 'evaluation' && rule.enabled && rule.modelFamilies.includes(model.family);
}

/**
 * モデルに選べる評価ルールが無い理由。そのモデル系列を評価するルールが無いか、あっても無効に
 * なっている（その場合は1つ有効にすれば足りるので、ダイアログは「作成する」の代わりにそう伝える）。
 */
export function missingEvaluationRuleReason(
  rules: readonly ModelAutomationRule[],
  model: Model,
): 'none' | 'disabled' {
  const evaluatesFamily = (rule: ModelAutomationRule) =>
    rule.kind === 'evaluation' && rule.modelFamilies.includes(model.family);
  return rules.some((rule) => evaluatesFamily(rule) && !rule.enabled) ? 'disabled' : 'none';
}

/** 選んだ評価ルールは、選んだモデルをまだ評価できるあいだだけ残す。 */
export function updatePromotionPolicyDraft({
  next,
  models,
  rules,
}: {
  next: PromotionPolicyDraft;
  models: Model[];
  rules: ModelAutomationRule[];
}): PromotionPolicyDraft {
  const model = models.find((item) => item.id === next.modelId);
  const rule = rules.find((item) => item.id === next.evaluationRuleId);
  if (rule && (!model || !isEvaluationRuleEligible(rule, model)))
    return { ...next, evaluationRuleId: '' };
  return next;
}

/** 符号を保った有限の数。符号で、改善を求めるのか後退を許すのかが決まる。 */
export function parseCriterionThreshold(value: string): number {
  const trimmed = value.trim();
  const threshold = Number(trimmed);
  if (!trimmed || !Number.isFinite(threshold))
    throw new Error(text.promotionCriterionThresholdInvalid);
  return threshold;
}

function buildCriterion(draft: PromotionCriterionDraft): PromotionCriterion {
  const metric = draft.metric.trim();
  if (!metric) throw new Error(text.promotionCriterionMetricRequired);
  return {
    metric,
    direction: draft.direction,
    mode: draft.mode,
    threshold: parseCriterionThreshold(draft.threshold),
  };
}

/** その行を保存したときの合否基準。行がまだ不完全か不正なあいだはnull。 */
export function previewCriterion(draft: PromotionCriterionDraft): PromotionCriterion | null {
  try {
    return buildCriterion(draft);
  } catch {
    return null;
  }
}

export function buildPromotionPolicyInput({
  draft,
  models,
  rules,
}: {
  draft: PromotionPolicyDraft;
  models: Model[];
  rules: ModelAutomationRule[];
}): PromotionPolicyCreate {
  const name = draft.name.trim();
  const targetAlias = draft.targetAlias.trim();
  const baselineAlias = draft.baselineAlias.trim();
  if (!name) throw new Error(text.promotionPolicyNameRequired);
  const model = models.find((item) => item.id === draft.modelId);
  if (!model) throw new Error(text.promotionModelRequired);
  if (!targetAlias) throw new Error(text.promotionTargetAliasRequired);
  if (!baselineAlias) throw new Error(text.promotionBaselineAliasRequired);
  const rule = rules.find((item) => item.id === draft.evaluationRuleId);
  if (!rule || !isEvaluationRuleEligible(rule, model))
    throw new Error(text.promotionEvaluationRuleRequired);
  if (!draft.criteria.length) throw new Error(text.promotionCriteriaRequired);
  if (draft.criteria.length > PROMOTION_CRITERIA_MAX)
    throw new LocalizedError(() => promotionTextTemplates.criteriaTooMany(PROMOTION_CRITERIA_MAX));
  return {
    name,
    enabled: draft.enabled,
    modelId: model.id,
    targetAlias,
    baselineAlias,
    evaluationRuleId: rule.id,
    criteria: draft.criteria.map(buildCriterion),
    missingBaseline: draft.missingBaseline,
    autoPromote: draft.autoPromote,
  };
}

/**
 * 基準バージョンとの比較で、しきい値の符号が何を意味するか。WERのような'lower'のメトリクスは
 * 下がると改善なので、そこでは-0.01は改善を求め、+0.01は上昇を許す。絶対値の合否基準には
 * 基準バージョンが無いので、ここでの意味も無い（null）。
 */
export type CriterionThresholdMeaning =
  'improvement_required' | 'no_regression' | 'regression_allowed';

export function getCriterionThresholdMeaning(
  criterion: Pick<PromotionCriterion, 'direction' | 'mode' | 'threshold'>,
): CriterionThresholdMeaning | null {
  if (criterion.mode === 'absolute') return null;
  if (criterion.threshold === 0) return 'no_regression';
  const improves =
    criterion.direction === 'higher' ? criterion.threshold > 0 : criterion.threshold < 0;
  return improves ? 'improvement_required' : 'regression_allowed';
}

const getPercentFormat = memoizePerIntlLocale(
  (intlLocale) =>
    new Intl.NumberFormat(intlLocale, {
      style: 'percent',
      maximumFractionDigits: 4,
      signDisplay: 'exceptZero',
    }),
);
const getThresholdFormat = memoizePerIntlLocale(
  (intlLocale) =>
    new Intl.NumberFormat(intlLocale, {
      maximumFractionDigits: 6,
      signDisplay: 'exceptZero',
    }),
);

/** relative_deltaのしきい値は比率で、百分率で表示する。 */
export function formatCriterionThreshold(
  criterion: Pick<PromotionCriterion, 'mode' | 'threshold'>,
): string {
  if (criterion.mode === 'absolute') return String(criterion.threshold);
  const thresholdFormat = criterion.mode === 'relative_delta' ? getPercentFormat() : getThresholdFormat();
  return thresholdFormat.format(criterion.threshold);
}

/** "werの基準との差 ≤ -0.01"のような1行の要約。 */
export function summarizeCriterion(criterion: PromotionCriterion): string {
  const comparator = criterion.direction === 'higher' ? '≥' : '≤';
  return `${promotionTextTemplates.criterionSubject(criterion.metric, criterion.mode)} ${comparator} ${formatCriterionThreshold(criterion)}`;
}
