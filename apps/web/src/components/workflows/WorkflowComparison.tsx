import type { WorkflowExecution } from '@mmt/contracts';
import { ResponsiveTable } from '../ResponsiveTable';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

export function WorkflowComparison({
  current,
  previous,
}: {
  current: WorkflowExecution;
  previous: WorkflowExecution;
}) {
  useLocale();
  const rows = current.steps.flatMap((step) => {
    const compared = previous.steps.find((candidate) => candidate.stepKey === step.stepKey);
    const names = [
      ...new Set([...Object.keys(step.metrics), ...Object.keys(compared?.metrics ?? {})]),
    ].sort();
    return names.map((metric) => ({
      key: `${step.stepKey}:${metric}`,
      step: step.name,
      metric,
      current: step.metrics[metric],
      previous: compared?.metrics[metric],
    }));
  });
  return (
    <section>
      <h3>{labels.workflowCompare}</h3>
      <ResponsiveTable
        rows={rows}
        rowKey={(row) => row.key}
        columns={[
          {
            key: 'step',
            header: labels.workflowSteps,
            priority: 'primary',
            render: (row) => row.step,
          },
          {
            key: 'metric',
            header: labels.workflowMetric,
            priority: 'primary',
            render: (row) => <span className="mono">{row.metric}</span>,
          },
          {
            key: 'current',
            header: current.id.slice(0, 8),
            priority: 'primary',
            render: (row) => row.current ?? '—',
          },
          {
            key: 'previous',
            header: previous.id.slice(0, 8),
            priority: 'primary',
            render: (row) => row.previous ?? '—',
          },
        ]}
      />
    </section>
  );
}
