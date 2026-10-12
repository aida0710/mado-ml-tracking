import type { JobStatus, WorkflowExecutionStatus } from '@mmt/contracts';

type ExecutionState = { status: WorkflowExecutionStatus };

// A failed or stopped execution can be resumed; the step Job that ended it ends with the same status.
const RESUMABLE_STATUSES: readonly string[] = ['failed', 'canceled'] satisfies (WorkflowExecutionStatus &
  JobStatus)[];

/** Still moving: its screen keeps polling until it ends. */
export function isActiveWorkflowExecution({ status }: ExecutionState): boolean {
  return status === 'running' || status === 'canceling';
}

/** Can be stopped: a stop already asked for ('canceling') is not asked again. */
export function isStoppableWorkflowExecution({ status }: ExecutionState): boolean {
  return status === 'running';
}

/** Can be resumed in a new execution that reuses its completed steps. */
export function isResumableWorkflowExecution({ status }: ExecutionState): boolean {
  return RESUMABLE_STATUSES.includes(status);
}

/** A workflow step's Job that failed or was canceled, so its execution can be resumed. */
export function isResumableWorkflowStepJob({ status }: { status: JobStatus }): boolean {
  return RESUMABLE_STATUSES.includes(status);
}
