import type { RuleMetricKeys } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { promotionText, promotionTextTemplates } from '../i18n/promotion';

/**
 * 合否基準のメトリクスの入力候補。評価ルールのRunが記録したキーのうち、入力した文字を含むもの
 * （大文字と小文字は区別しない）。一度も記録されていないキーを入力したら注意を添える。判定で値が
 * 見つからず、候補のバージョンが不合格になるため。記録済みのキーのどれもそれを含まなくなったら
 * 警告にする。それまでは、利用者がまだ入力候補に向けて打っている途中かもしれない。
 */
export function suggestMetricKeys(value: string, recorded: RuleMetricKeys | undefined): FieldSuggestions {
  const typed = value.trim();
  const keys = recorded?.items ?? [];
  const folded = typed.toLowerCase();
  const items = keys.filter((key) => key.toLowerCase().includes(folded));
  if (!typed || !keys.length || keys.includes(typed)) return { items };
  const note = promotionTextTemplates.metricNotRecorded(typed);
  return items.length ? { items, note } : { items, note, noteTone: 'warning' };
}

/** 入力候補に出すメトリクス名がどこから来たか。合否基準の下に出す。 */
export function describeMetricKeySource(recorded: RuleMetricKeys | undefined): string {
  if (!recorded) return promotionText.promotionMetricKeysChooseRule;
  if (recorded.source === 'rule_runs') return promotionText.promotionMetricKeysFromRule;
  if (recorded.source === 'code_version_runs')
    return promotionText.promotionMetricKeysFromCodeVersion;
  return promotionText.promotionMetricKeysNone;
}
