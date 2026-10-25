import type { SweepTrial, SweepTrialState } from '@mmt/contracts';
import { useLocale } from '../../i18n/useLocale';
import { sweepTrialStateLabels } from '../../i18n/sweeps';
import { textTemplates } from '../../i18n/catalog';

// early_stoppedには専用の色を付け、利用者のキャンセルと読み違えないようにする。
const TRIAL_BADGE_CLASSES: Record<SweepTrialState, string> = {
  queued: 'status-neutral',
  running: 'status-info',
  finished: 'status-success',
  failed: 'status-danger',
  canceled: 'status-neutral',
  early_stopped: 'status-stopped',
};

/** 試行の状態。早期終了したときはその理由も出す。 */
export function SweepTrialStateBadge({ trial }: { trial: SweepTrial }) {
  useLocale();
  return (
    <span className={`status-badge ${TRIAL_BADGE_CLASSES[trial.state]}`}
      title={trial.stopReason ? textTemplates.sweepEarlyStoppedReason(trial.stopReason) : undefined}>
      <span aria-hidden="true">●</span>
      {sweepTrialStateLabels[trial.state]}
    </span>
  );
}
