import type { WorkflowExecution, WorkflowExecutionSummary } from '@mmt/contracts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useWorkflowCreatorName } from '../hooks/useWorkflowCreatorName';
import { shortId } from '../lib/jobDisplay';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

/**
 * 実行を止める前に、その実行、作った人、起きること（動いているJobに停止を頼み、後のステップは
 * 始めない）を示して尋ねる。Project adminは同僚の実行も止められるので、作った人を思い込まずに
 * 名前で示す。
 */
export function WorkflowCancelDialog({
  projectId,
  execution,
  cancel,
  onCanceled,
  onClose,
}: {
  projectId: string;
  execution: WorkflowExecutionSummary;
  cancel: (executionId: string) => Promise<WorkflowExecution>;
  onCanceled: () => void;
  onClose: () => void;
}) {
  useLocale();
  const createdByName = useWorkflowCreatorName(projectId, execution);
  return (
    <ConfirmDialog
      title={labels.workflowCancel}
      message={
        <>
          {workflowsTextTemplates.workflowCancelTarget({
            executionId: shortId(execution.id),
            revision: execution.revision,
            createdByName,
          })}
          <br />
          {labels.workflowCancelEffect}
        </>
      }
      confirmLabel={labels.workflowCancelConfirm}
      destructive
      onConfirm={() => cancel(execution.id)}
      onConfirmed={onCanceled}
      onClose={onClose}
    />
  );
}
