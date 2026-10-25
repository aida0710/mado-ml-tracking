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

/** ステップがデータセットをどう使うか。定義でも実行でも使う。例:「学習・混合比率の重み: 2」。 */
export function datasetUsageLabel({ role, weight }: { role: DatasetUsageRole; weight: number }): string {
  return joinLabels([datasetRoleLabel(role), `${workflowsText.workflowWeight}: ${weight}`]);
}

/**
 * JobとRunの言葉での状態（待機中、実行中、…）。独自の言葉を持つのは、前のステップを待つ
 * ステップだけ。動いているJobの停止を待つ実行は、Jobと同じく「停止要求済み」。
 */
export function workflowStatusLabel(status: WorkflowStepStatus | WorkflowExecutionStatus): string {
  if (status === 'pending') return workflowsText.workflowPending;
  if (status === 'canceling') return text.cancelRequested;
  return text[status];
}
