import type { WorkflowStep, WorkflowStepInput } from '@mmt/contracts';
import { z } from 'zod';
import {
  PREPROCESSING_METRIC_PREFIX,
  PREPROCESSING_SUMMARY_METRIC_NAMES,
  WORKFLOW_PAGE_SIZE,
} from '@mmt/contracts';
import { DomainError } from './errors.js';
import { uuidSchema } from './validation.js';

export const workflowHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().max(WORKFLOW_PAGE_SIZE).default(WORKFLOW_PAGE_SIZE),
  cursor: uuidSchema.optional(),
});

// The cursor is the id of the last version of the previous page, as in the execution history.
export const workflowVersionsQuerySchema = z.strictObject({
  cursor: uuidSchema.optional(),
});

const knownPreprocessingMetrics: ReadonlySet<string> = new Set(PREPROCESSING_SUMMARY_METRIC_NAMES);

export function validateWorkflowOrder(steps: WorkflowStepInput[]): void {
  const previousKeys = new Set<string>();
  for (const step of steps) {
    if (previousKeys.has(step.key))
      throw new DomainError(422, 'ステップのkeyは重複できません', 'workflow_step_duplicate');
    const sourceKeys = step.inputs.flatMap((binding) =>
      binding.source.kind === 'step' ? [binding.source.stepKey] : [],
    );
    if (step.modelFromStepKey) sourceKeys.push(step.modelFromStepKey);
    if (sourceKeys.some((key) => !previousKeys.has(key)))
      throw new DomainError(
        422,
        '入力は先に実行するステップの出力を指定してください',
        'workflow_source_order',
      );
    previousKeys.add(step.key);
  }
}

// The checks below catch at save time what an execution would otherwise reveal only when it
// reaches the step, possibly hours after the first one started.

/** A preprocessing.* quality gate on a metric the API never records could never pass. */
export function validateQualityGateMetrics(steps: readonly WorkflowStepInput[]): void {
  for (const gate of steps.flatMap((step) => step.qualityGates))
    if (
      gate.metric.startsWith(PREPROCESSING_METRIC_PREFIX) &&
      !knownPreprocessingMetrics.has(gate.metric)
    )
      throw new DomainError(
        422,
        `前処理の指標「${gate.metric}」はありません。${PREPROCESSING_METRIC_PREFIX}で始まる指標は前処理のレポートから計算したものだけです`,
        'workflow_quality_metric_unknown',
      );
}

/** A step that takes its model from another needs that step's Task to register one. */
export function validateModelSources(steps: readonly WorkflowStep[]): void {
  const stepsByKey = new Map(steps.map((step) => [step.key, step]));
  for (const step of steps) {
    const modelSource = step.modelFromStepKey ? stepsByKey.get(step.modelFromStepKey) : undefined;
    if (modelSource && !modelSource.task.outputModel)
      throw new DomainError(
        422,
        `モデルの入力元「${modelSource.name}」のTaskに、成功時に出力モデルを登録する設定がありません`,
        'workflow_model_source_unregistered',
      );
  }
}
