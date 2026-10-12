import { useEffect, useId, useState } from 'react';
import type { WorkflowExecution, WorkflowExecutionSummary } from '@mmt/contracts';
import { WorkflowLaunchDialog } from '../../dialogs/WorkflowLaunchDialog';
import { WorkflowCancelDialog } from '../../dialogs/WorkflowCancelDialog';
import type { WorkflowLaunchIntent } from '../../lib/workflowLaunchKeys';
import {
  isResumableWorkflowExecution,
  isStoppableWorkflowExecution,
} from '../../lib/workflowExecutionState';
import { workflowsText as labels } from '../../i18n/workflows';
import { useLocale } from '../../i18n/useLocale';

type ControlAction = 'resume' | 'cancel';

/** What the execution allows now: resuming a failed or canceled one, or stopping a running one. */
function allowedAction(execution: WorkflowExecutionSummary): ControlAction | null {
  if (isResumableWorkflowExecution(execution)) return 'resume';
  if (isStoppableWorkflowExecution(execution)) return 'cancel';
  return null;
}

/**
 * Resuming or stopping the shown execution, each after a confirmation; the page says what
 * happened. An editor who may not control it (only its creator and Project admins may) reads why
 * instead of finding the buttons gone.
 */
export function WorkflowExecutionControls({
  projectId,
  execution,
  canEdit,
  canControl,
  launch,
  cancel,
  onResumed,
  onCanceled,
}: {
  projectId: string;
  execution: WorkflowExecutionSummary;
  canEdit: boolean;
  /** lib/permissions canControlWorkflowExecution */
  canControl: boolean;
  launch: (intent: WorkflowLaunchIntent) => Promise<WorkflowExecution>;
  cancel: (executionId: string) => Promise<WorkflowExecution>;
  onResumed: (started: WorkflowExecution) => void;
  onCanceled: (canceled: WorkflowExecutionSummary) => void;
}) {
  useLocale();
  const resumeHintId = useId();
  const action = allowedAction(execution);
  const [confirming, setConfirming] = useState<{
    action: ControlAction;
    executionId: string;
  } | null>(null);
  // A confirmation belongs to the execution and the state it was opened for. Once the execution
  // ends, is stopped from elsewhere or another one is shown, it closes and does not come back.
  const isConfirming = confirming?.executionId === execution.id && confirming.action === action;
  useEffect(() => {
    if (confirming && !isConfirming) setConfirming(null);
  }, [confirming, isConfirming]);
  if (!canEdit || !action) return null;
  const confirm = () => setConfirming({ action, executionId: execution.id });
  const close = () => setConfirming(null);
  return (
    <div className="workflow-execution-controls">
      {!canControl ? (
        <p className="muted">{labels.workflowControlOwnerOnly}</p>
      ) : action === 'resume' ? (
        <>
          <button className="button" aria-describedby={resumeHintId} onClick={confirm}>
            {labels.workflowResume}
          </button>
          <p id={resumeHintId} className="muted">
            {labels.workflowResumeHint}
          </p>
        </>
      ) : (
        <button className="button danger" onClick={confirm}>
          {labels.workflowCancel}
        </button>
      )}
      {isConfirming && action === 'resume' && (
        <WorkflowLaunchDialog
          kind="resume"
          execution={execution}
          launch={launch}
          onStarted={(started) => {
            close();
            onResumed(started);
          }}
          onClose={close}
        />
      )}
      {isConfirming && action === 'cancel' && (
        <WorkflowCancelDialog
          projectId={projectId}
          execution={execution}
          cancel={cancel}
          onCanceled={() => {
            close();
            onCanceled(execution);
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
