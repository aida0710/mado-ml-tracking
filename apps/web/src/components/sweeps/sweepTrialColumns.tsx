/** Sweepの試行の表の列。各試行のパラメータ、目的値、状態、Run/Job。 */
import { Link } from 'react-router-dom';
import type { SweepObjective, SweepTrial } from '@mmt/contracts';
import { formatNumber, formatValue } from '../../lib/format';
import { trialParameterNames } from '../../lib/sweepTrials';
import type { ResponsiveTableColumn } from '../ResponsiveTable';
import { SweepTrialStateBadge } from './SweepTrialStateBadge';
import { text, textTemplates } from '../../i18n/catalog';
import { formatNote } from '../../i18n/textJoining';

// サンプルした値は浮動小数点の桁をすべて持つ。有効数字6桁にして列を読みやすくする。
const formatParameter = (value: unknown) => (typeof value === 'number' ? formatNumber(value) : formatValue(value));

export interface SweepTrialTableInput {
  projectId: string;
  trials: SweepTrial[];
  objective: SweepObjective;
  bestTrialId: string | null;
}

/**
 * 試行の表の列。狭い画面では、行に試行の番号、目的値、状態を残し、パラメータとRun/Jobの
 * リンクは行の下に開く。
 */
export function sweepTrialColumns({
  projectId,
  trials,
  objective,
  bestTrialId,
}: SweepTrialTableInput): ResponsiveTableColumn<SweepTrial>[] {
  const parameterColumns: ResponsiveTableColumn<SweepTrial>[] = trialParameterNames(trials).map((name) => ({
    key: `parameter:${name}`,
    header: <span className="mono">{name}</span>,
    className: 'mono',
    priority: 'secondary',
    render: (trial) => formatParameter(trial.parameters[name]),
  }));
  return [
    {
      key: 'trial',
      header: text.sweepTrialIndex,
      className: 'mono',
      priority: 'primary',
      render: (trial) => textTemplates.sweepTrialRunName(trial.trialIndex),
    },
    ...parameterColumns,
    {
      key: 'objective',
      header: `${text.sweepObjectiveValue}${formatNote(objective.metric)}`,
      className: 'mono',
      priority: 'primary',
      render: (trial) => (
        <>
          {trial.objectiveValue === null ? '—' : formatNumber(trial.objectiveValue)}
          {trial.id === bestTrialId && <small className="sweep-best-marker">{text.sweepBestTrial}</small>}
        </>
      ),
    },
    {
      key: 'state',
      header: text.status,
      priority: 'primary',
      render: (trial) => <SweepTrialStateBadge trial={trial} />,
    },
    {
      key: 'run',
      header: text.sweepTrialRun,
      priority: 'secondary',
      render: (trial) => <Link to={`/projects/${projectId}/runs/${trial.runId}`}>{text.automationRun}</Link>,
    },
    {
      key: 'job',
      header: text.sweepTrialJob,
      priority: 'secondary',
      render: (trial) => (
        <>
          <Link to={`/projects/${projectId}/jobs?job=${trial.jobId}`}>{text.automationJob}</Link>
          {trial.jobCancelRequested && <small> {text.cancelRequested}</small>}
        </>
      ),
    },
  ];
}
