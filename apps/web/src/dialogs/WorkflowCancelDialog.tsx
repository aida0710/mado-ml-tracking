import type { WorkflowExecution, WorkflowExecutionSummary } from '@mmt/contracts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useWorkflowCreatorName } from '../hooks/useWorkflowCreatorName';
import { shortId } from '../lib/jobDisplay';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

/**
 * Asks before stopping an execution, naming it, its creator and what happens: the running Job is
 * asked to stop and no later step starts. A Project admin may stop a colleague's execution, so
 * the creator is named rather than assumed.
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
