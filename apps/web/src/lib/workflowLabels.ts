import type { DatasetUsageRole, WorkflowStepStatus, WorkflowExecutionStatus } from '@mmt/contracts';
import { text } from '../i18n/catalog';
import { joinLabels } from '../i18n/textJoining';
import { workflowsText } from '../i18n/workflows';

export function datasetRoleLabel(role: DatasetUsageRole): string {
  return {
    input: workflowsText.workflowInputRole,
    training: workflowsText.workflowTrainingRole,
    validation: workflowsText.workflowValidationRole,
    test: workflowsText.workflowTestRole,
  }[role];
}

/** How a step uses a dataset, in a definition and in an execution: 「学習・混合比率の重み: 2」. */
export function datasetUsageLabel({ role, weight }: { role: DatasetUsageRole; weight: number }): string {
  return joinLabels([datasetRoleLabel(role), `${workflowsText.workflowWeight}: ${weight}`]);
}

/**
 * A status in the words of Jobs and Runs (待機中, 実行中, …). Only a step waiting for the one before
 * it has its own words; an execution waiting for its running Job to stop is 「停止要求済み」 as a Job.
 */
export function workflowStatusLabel(status: WorkflowStepStatus | WorkflowExecutionStatus): string {
  if (status === 'pending') return workflowsText.workflowPending;
  if (status === 'canceling') return text.cancelRequested;
  return text[status];
}
