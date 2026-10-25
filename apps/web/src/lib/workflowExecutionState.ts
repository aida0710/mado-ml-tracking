import type { JobStatus, WorkflowExecutionStatus } from '@mmt/contracts';

type ExecutionState = { status: WorkflowExecutionStatus };

// 失敗した・止めた実行は再開できる。その実行を終わらせたステップのJobも、同じ状態で終わる。
const RESUMABLE_STATUSES: readonly string[] = ['failed', 'canceled'] satisfies (WorkflowExecutionStatus &
  JobStatus)[];

/** まだ動いている。終わるまで画面がポーリングを続ける。 */
export function isActiveWorkflowExecution({ status }: ExecutionState): boolean {
  return status === 'running' || status === 'canceling';
}

/** 止められる。すでに求めた停止（'canceling'）は二度求めない。 */
export function isStoppableWorkflowExecution({ status }: ExecutionState): boolean {
  return status === 'running';
}

/** 終わったステップを使い回す新しい実行で再開できる。 */
export function isResumableWorkflowExecution({ status }: ExecutionState): boolean {
  return RESUMABLE_STATUSES.includes(status);
}

/** 失敗したか取り消された、ワークフローのステップのJob。その実行を再開できる。 */
export function isResumableWorkflowStepJob({ status }: { status: JobStatus }): boolean {
  return RESUMABLE_STATUSES.includes(status);
}
