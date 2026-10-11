import type { RuleMetricKeys } from '@mmt/contracts';
import type { FieldSuggestions } from '../types/form';
import { promotionText, promotionTextTemplates } from '../i18n/promotion';

/**
 * Candidates for a criterion's metric: the keys the evaluation rule's Runs recorded that contain
 * what is typed (letter case ignored). A typed key they never recorded is noted: the judgement
 * would find no value and fail the candidate. It is a warning once no recorded key contains it;
 * before that the person may still be typing toward a candidate.
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

/** Where the offered metric names come from, said under the criteria. */
export function describeMetricKeySource(recorded: RuleMetricKeys | undefined): string {
  if (!recorded) return promotionText.promotionMetricKeysChooseRule;
  if (recorded.source === 'rule_runs') return promotionText.promotionMetricKeysFromRule;
  if (recorded.source === 'code_version_runs')
    return promotionText.promotionMetricKeysFromCodeVersion;
  return promotionText.promotionMetricKeysNone;
}
