import type { JobStatus } from '@mmt/contracts';
import { JOB_STATUS_BADGE_CLASS } from '../lib/statusBadge';
import { useLocale } from '../i18n/useLocale';
import { sweepTrialStateLabels } from '../i18n/sweeps';
import { text } from '../i18n/catalog';

/**
 * earlyStoppedのとき、Sweepが早期に止めた取り消し済みのRunやJobを、Sweep自身の言葉と色で表示し、
 * 人による取り消しと読まれないようにする。
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
