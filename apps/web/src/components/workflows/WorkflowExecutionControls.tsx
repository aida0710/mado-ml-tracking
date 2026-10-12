import { useState } from 'react';
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

/**
 * Resuming and stopping the shown execution, each after a confirmation; the page says what
 * happened. An editor who may not control it (only its creator and Project admins may) reads why
 * instead of finding the buttons gone.
 */
export function WorkflowExecutionControls({
  projectId,
  workflowName,
  execution,
  canEdit,
  canControl,
  launch,
  cancel,
  onResumed,
  onCanceled,
}: {
  projectId: string;
  workflowName: string;
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
  const [confirming, setConfirming] = useState<'resume' | 'cancel' | null>(null);
  const isResumable = isResumableWorkflowExecution(execution);
  const isStoppable = isStoppableWorkflowExecution(execution);
  if (!canEdit || (!isResumable && !isStoppable)) return null;
  return (
    <div className="workflow-execution-controls">
      {!canControl && (isResumable || isStoppable) && (
        <p className="muted">{labels.workflowControlOwnerOnly}</p>
      )}
      {canControl && isResumable && (
        <div className="section-actions">
          <button className="button" onClick={() => setConfirming('resume')}>
            {labels.workflowResume}
          </button>
          <p className="muted">{labels.workflowResumeHint}</p>
        </div>
      )}
      {canControl && isStoppable && (
        <div className="section-actions">
          <button className="button danger" onClick={() => setConfirming('cancel')}>
            {labels.workflowCancel}
          </button>
        </div>
      )}
      {confirming === 'resume' && (
        <WorkflowLaunchDialog
          workflowName={workflowName}
          revision={execution.revision}
          resumeFrom={execution}
          launch={launch}
          onStarted={(started) => {
            setConfirming(null);
            onResumed(started);
          }}
          onClose={() => setConfirming(null)}
        />
      )}
      {confirming === 'cancel' && (
        <WorkflowCancelDialog
          projectId={projectId}
          execution={execution}
          cancel={cancel}
          onCanceled={() => {
            setConfirming(null);
            onCanceled(execution);
          }}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
