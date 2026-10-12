import type { WorkflowExecutionStatus } from '@mmt/contracts';

type ExecutionState = { status: WorkflowExecutionStatus };

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
  return status === 'failed' || status === 'canceled';
}
