import type { SweepTrial, SweepTrialState } from '@mmt/contracts';
import { useLocale } from '../../i18n/useLocale';
import { sweepTrialStateLabels } from '../../i18n/sweeps';
import { textTemplates } from '../../i18n/catalog';

// early_stopped gets its own color so it is not read as a user cancel.
const TRIAL_BADGE_CLASSES: Record<SweepTrialState, string> = {
  queued: 'status-queued',
  running: 'status-running',
  finished: 'status-finished',
  failed: 'status-failed',
  canceled: 'status-canceled',
  early_stopped: 'status-early-stopped',
};

/** A trial's state, with why it stopped early when it did. */
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
