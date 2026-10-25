import type { WorkflowExecutionStatus, WorkflowStepStatus } from '@mmt/contracts';
import { StatusBadge } from '../StatusBadge';
import { workflowStatusLabel } from '../../lib/workflowLabels';
import { useLocale } from '../../i18n/useLocale';

// Jobに無い2つの状態に当てるJobの色。待機はqueuedのJobと同じ色、停止の途中はまだ実行中の色。
const OWN_STATE_CLASSES = { pending: 'status-neutral', canceling: 'status-info' } as const;

/**
 * ワークフローの実行またはステップの状態を、JobやRunと同じバッジで出す。前のステップを待つ
 * ステップと、停止を求められた実行には専用の言葉（lib/workflowLabels）があり、一番近いJobの
 * 状態の色で出す。
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
