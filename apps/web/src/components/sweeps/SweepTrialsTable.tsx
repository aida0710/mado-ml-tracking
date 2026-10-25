import { useState } from 'react';
import { sortTrials, type SweepTrialOrder } from '../../lib/sweepTrials';
import { ResponsiveTable } from '../ResponsiveTable';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { sweepTrialColumns, type SweepTrialTableInput } from './sweepTrialColumns';

/** One row per trial: its parameters, objective, state and the Run/Job it ran as. */
export function SweepTrialsTable({
  projectId,
  trials,
  objective,
  bestTrialId,
}: SweepTrialTableInput) {
  useLocale();
  const [order, setOrder] = useState<SweepTrialOrder>('trial_index');
  return (
    <div className="sweep-trials" data-testid="sweep-trials">
      <label className="chart-selector">
        <span>{text.sort}</span>
        <select aria-label={text.sort} value={order} onChange={(event) => setOrder(event.target.value as SweepTrialOrder)}>
          <option value="trial_index">{text.sweepSortByTrial}</option>
          <option value="objective">{text.sweepSortByObjective}</option>
        </select>
      </label>
      <ResponsiveTable
        rows={sortTrials(trials, order, objective.goal)}
        rowKey={(trial) => trial.id}
        empty={text.sweepNoTrials}
        columns={sweepTrialColumns({ projectId, trials, objective, bestTrialId })}
      />
    </div>
  );
}
