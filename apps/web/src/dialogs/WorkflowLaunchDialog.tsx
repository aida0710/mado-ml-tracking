import { useRef } from 'react';
import type { WorkflowExecution, WorkflowExecutionSummary } from '@mmt/contracts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { shortId } from '../lib/jobDisplay';
import type { WorkflowLaunchIntent } from '../lib/workflowLaunchKeys';
import { workflowsText as labels, workflowsTextTemplates } from '../i18n/workflows';
import { useLocale } from '../i18n/useLocale';

/** What the confirmation starts: a version of the workflow, or a failed or canceled execution again. */
type LaunchTarget =
  | { kind: 'start'; workflowName: string; revision: number }
  | { kind: 'resume'; execution: WorkflowExecutionSummary };

/** The confirmation's words, in the display language, and the start it sends. */
function describeLaunch(target: LaunchTarget) {
  if (target.kind === 'resume') {
    const { execution } = target;
    return {
      title: labels.workflowResume,
      subject: workflowsTextTemplates.workflowResumeTarget(shortId(execution.id), execution.revision),
      effect: labels.workflowResumeEffect,
      confirmLabel: labels.workflowResumeConfirm,
      intent: { revision: execution.revision, resumeFromExecutionId: execution.id },
    };
  }
  return {
    title: labels.workflowStart,
    subject: workflowsTextTemplates.workflowStartTarget(target.workflowName, target.revision),
    effect: labels.workflowStartEffect,
    confirmLabel: labels.workflowStartConfirm,
    intent: { revision: target.revision },
  };
}

/**
 * Asks before starting a version of the workflow, or before resuming a failed or canceled
 * execution in a new one, naming the version and what will run. A confirmation sent again after
 * a failure keeps its idempotency key (useWorkflowActions), so it cannot start two executions.
 */
export function WorkflowLaunchDialog({
  launch,
  onStarted,
  onClose,
  ...target
}: LaunchTarget & {
  launch: (intent: WorkflowLaunchIntent) => Promise<WorkflowExecution>;
  onStarted: (execution: WorkflowExecution) => void;
  onClose: () => void;
}) {
  useLocale();
  const started = useRef<WorkflowExecution | null>(null);
  const { title, subject, effect, confirmLabel, intent } = describeLaunch(target);
  return (
    <ConfirmDialog
      title={title}
      message={
        <>
          {subject}
          <br />
          {effect}
        </>
      }
      confirmLabel={confirmLabel}
      onConfirm={async () => {
        started.current = await launch(intent);
      }}
      onConfirmed={() => {
        if (started.current) onStarted(started.current);
      }}
      onClose={onClose}
    />
  );
}
