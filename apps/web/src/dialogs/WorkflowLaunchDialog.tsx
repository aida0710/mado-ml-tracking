import { useRef } from 'react';
import type { WorkflowExecution, WorkflowExecutionSummary } from '@mmt/contracts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { shortId } from '../lib/jobDisplay';
import type { WorkflowLaunchIntent } from '../lib/workflowLaunchKeys';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

/**
 * Asks before starting a version of the workflow, or before resuming a failed or canceled
 * execution in a new one, naming the version and what will run. A confirmation sent again after
 * a failure keeps its idempotency key (useWorkflowActions), so it cannot start two executions.
 */
export function WorkflowLaunchDialog({
  workflowName,
  revision,
  resumeFrom,
  launch,
  onStarted,
  onClose,
}: {
  workflowName: string;
  revision: number;
  /** The execution to resume, or null for a fresh start of `revision`. */
  resumeFrom: WorkflowExecutionSummary | null;
  launch: (intent: WorkflowLaunchIntent) => Promise<WorkflowExecution>;
  onStarted: (execution: WorkflowExecution) => void;
  onClose: () => void;
}) {
  useLocale();
  const started = useRef<WorkflowExecution | null>(null);
  return (
    <ConfirmDialog
      title={resumeFrom ? labels.workflowResume : labels.workflowStart}
      message={
        <>
          {resumeFrom
            ? workflowsTextTemplates.workflowResumeTarget(shortId(resumeFrom.id), resumeFrom.revision)
            : workflowsTextTemplates.workflowStartTarget(workflowName, revision)}
          <br />
          {resumeFrom ? labels.workflowResumeEffect : labels.workflowStartEffect}
        </>
      }
      confirmLabel={resumeFrom ? labels.workflowResumeConfirm : labels.workflowStartConfirm}
      onConfirm={async () => {
        started.current = await launch(
          resumeFrom ? { revision, resumeFromExecutionId: resumeFrom.id } : { revision },
        );
      }}
      onConfirmed={() => {
        if (started.current) onStarted(started.current);
      }}
      onClose={onClose}
    />
  );
}
