import type { JobStatus, ModelAutomationExecution, RunStatus } from '@mmt/contracts';

const ACTIVE_STATUSES: readonly (RunStatus | JobStatus)[] = ['queued', 'claimed', 'running'];

const isActiveStatus = (status: RunStatus | JobStatus | null) =>
  status !== null && ACTIVE_STATUSES.includes(status);

// 保留中の登録が待っているか、開始したRunやJobが終わっていない間は、ポーリングを続ける。
export function hasActiveExecution(
  executions: readonly Pick<ModelAutomationExecution, 'status' | 'runStatus' | 'jobStatus'>[],
): boolean {
  return executions.some(
    (execution) =>
      execution.status === 'pending' ||
      isActiveStatus(execution.runStatus) ||
      isActiveStatus(execution.jobStatus),
  );
}

export function hasActiveRun(runs: readonly { status: RunStatus }[]): boolean {
  return runs.some((run) => isActiveStatus(run.status));
}
