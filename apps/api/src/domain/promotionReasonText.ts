import type {
  PromotionCriterionMode,
  PromotionCriterionReason,
  PromotionCriterionResult,
} from '@mmt/contracts';

// aliasの履歴はこの文を保存したまま表示するので、人が読む文としてここで書く。言葉はWebの
// 昇格の画面（promotionModeLabelsと基準の理由）と同じにする。

// 引き算の浮動小数点の誤差を出さずに、2つの評価を見分けられるだけの桁数。
const SIGNIFICANT_DIGITS = 6;

const modeSuffixes: Record<PromotionCriterionMode, string> = {
  absolute: '',
  delta: 'の基準との差',
  relative_delta: 'の基準との相対差',
};

const missingValueReasons: Record<PromotionCriterionReason, string> = {
  candidate_metric_missing: '候補に値なし',
  candidate_metric_not_finite: '候補の値がNaN/∞',
  baseline_metric_missing: '基準に値なし',
  baseline_metric_not_finite: '基準の値がNaN/∞',
  baseline_zero: '基準が0',
  baseline_missing: '基準バージョンなし',
  baseline_not_evaluated: '基準バージョンの評価なし',
};

export function formatReasonNumber(value: number): string {
  return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));
}

/**
 * 1つの基準を`metricの基準との差=-0.000395833 ≤ 0`や`… ≤ 0: 値なし（基準バージョンなし）`の
 * 形で表す。
 */
export function describeCriterionResult(result: PromotionCriterionResult): string {
  const comparator = result.direction === 'higher' ? '≥' : '≤';
  const subject = `${result.metric}${modeSuffixes[result.mode]}`;
  const threshold = formatReasonNumber(result.threshold);
  if (result.observed === null) {
    const why = result.reason ? `（${missingValueReasons[result.reason]}）` : '';
    return `${subject} ${comparator} ${threshold}: 値なし${why}`;
  }
  return `${subject}=${formatReasonNumber(result.observed)} ${comparator} ${threshold}`;
}
