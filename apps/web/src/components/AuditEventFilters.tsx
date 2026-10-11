import type { AuditEvent } from '@mmt/contracts';
import type { AuditEventFilter } from '../api/audit';
import { accessText } from '../i18n/access';

const OUTCOMES: AuditEvent['outcome'][] = ['success', 'denied', 'failed'];
const outcomeLabels: Record<AuditEvent['outcome'], string> = {
  success: accessText.auditOutcomeSuccess,
  denied: accessText.auditOutcomeDenied,
  failed: accessText.auditOutcomeFailed,
};

/**
 * Narrows the audit log by outcome (to find refusals at once) and, in the global log, shows or
 * hides the sign-ins that make up most of it.
 */
export function AuditEventFilters({
  filter,
  onChange,
  offersSignIns,
}: {
  filter: AuditEventFilter;
  onChange: (filter: AuditEventFilter) => void;
  /** Sign-ins belong to no Project, so only the global log has them to hide. */
  offersSignIns: boolean;
}) {
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
