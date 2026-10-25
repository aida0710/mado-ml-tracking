import type { AuditEvent } from '@mmt/contracts';
import type { AuditEventFilter } from '../api/audit';
import { useLocale } from '../i18n/useLocale';
import { accessText } from '../i18n/access';

const OUTCOMES: AuditEvent['outcome'][] = ['success', 'denied', 'failure'];
const outcomeLabels: Record<AuditEvent['outcome'], string> = {
  get success() { return accessText.auditOutcomeSuccess; },
  get denied() { return accessText.auditOutcomeDenied; },
  get failure() { return accessText.auditOutcomeFailure; },
};

/**
 * 監査ログを結果で絞り込む（拒否をすぐ見つけるため）。全体のログでは、大半を占めるログインの記録の
 * 表示と非表示も切り替える。
 */
export function AuditEventFilters({
  filter,
  onChange,
  offersSignIns,
}: {
  filter: AuditEventFilter;
  onChange: (filter: AuditEventFilter) => void;
  /** ログインはどのProjectにも属さないので、隠す対象があるのは全体のログだけ。 */
  offersSignIns: boolean;
}) {
  useLocale();
  return (
    <div className="audit-filters">
      <select
        aria-label={accessText.auditOutcome}
        value={filter.outcome ?? ''}
        onChange={(event) =>
          onChange({
            ...filter,
            outcome: (event.target.value || undefined) as AuditEvent['outcome'] | undefined,
          })
        }
      >
        <option value="">{accessText.auditOutcomeAll}</option>
        {OUTCOMES.map((outcome) => (
          <option key={outcome} value={outcome}>
            {outcomeLabels[outcome]}
          </option>
        ))}
      </select>
      {offersSignIns && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={filter.hideSignIns ?? false}
            onChange={(event) => onChange({ ...filter, hideSignIns: event.target.checked })}
          />
          {accessText.auditHideSignIns}
        </label>
      )}
    </div>
  );
}
