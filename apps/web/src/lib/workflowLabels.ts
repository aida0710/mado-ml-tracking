import type { DatasetUsageRole, WorkflowStepStatus, WorkflowExecutionStatus } from '@mmt/contracts';
import { workflowsText } from '../i18n/workflows';

export function datasetRoleLabel(role: DatasetUsageRole): string {
  return {
    input: workflowsText.workflowInputRole,
    training: workflowsText.workflowTrainingRole,
    validation: workflowsText.workflowValidationRole,
    test: workflowsText.workflowTestRole,
  }[role];
}

export function workflowStatusLabel(status: WorkflowStepStatus | WorkflowExecutionStatus): string {
  return {
    running: workflowsText.workflowRunning,
    canceling: workflowsText.workflowCanceling,
    finished: workflowsText.workflowFinished,
    failed: workflowsText.workflowFailed,
    canceled: workflowsText.workflowCanceled,
    pending: workflowsText.workflowPending,
    queued: workflowsText.workflowQueued,
  }[status];
}
