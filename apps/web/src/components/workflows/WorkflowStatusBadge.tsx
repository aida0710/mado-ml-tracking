import type { WorkflowExecutionStatus, WorkflowStepStatus } from '@mmt/contracts';
import { StatusBadge } from '../StatusBadge';
import { workflowStatusLabel } from '../../lib/workflowLabels';
import { useLocale } from '../../i18n/useLocale';

// The Job colors of the two states a Job lacks: waiting like a queued Job, still running.
const OWN_STATE_CLASSES = { pending: 'status-neutral', canceling: 'status-info' } as const;

/**
 * The status of a workflow execution or step with the badge of Jobs and Runs. A step waiting for
 * the one before it and an execution whose stop was asked for have their own words
 * (lib/workflowLabels) in the color of the nearest Job state.
 */
export function WorkflowStatusBadge({
  status,
}: {
  status: WorkflowExecutionStatus | WorkflowStepStatus;
}) {
  useLocale();
  if (status !== 'pending' && status !== 'canceling') return <StatusBadge status={status} />;
  return (
    <span className={`status-badge ${OWN_STATE_CLASSES[status]}`}>
      <span aria-hidden="true">●</span>
      {workflowStatusLabel(status)}
    </span>
  );
}
