import type { JobStatus } from '@mmt/contracts';
import { JOB_STATUS_BADGE_CLASS } from '../lib/statusBadge';
import { useLocale } from '../i18n/useLocale';
import { sweepTrialStateLabels } from '../i18n/sweeps';
import { text } from '../i18n/catalog';

/**
 * earlyStopped shows a canceled Run or Job that a Sweep stopped early in the Sweep's own words and
 * color, so it is not read as a cancel by a person.
 */
export function StatusBadge({ status, earlyStopped = false }: { status: JobStatus; earlyStopped?: boolean }) {
  useLocale();
  if (earlyStopped && status === 'canceled')
    return (
      <span className="status-badge status-stopped">
        <span aria-hidden="true">●</span>
        {sweepTrialStateLabels.early_stopped}
      </span>
    );
  return (
    <span className={`status-badge ${JOB_STATUS_BADGE_CLASS[status]}`}>
      <span aria-hidden="true">●</span>
      {text[status]}
    </span>
  );
}
