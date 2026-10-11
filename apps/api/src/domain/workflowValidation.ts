import type { WorkflowStepInput } from '@mmt/contracts';
import { z } from 'zod';
import { WORKFLOW_PAGE_SIZE } from '@mmt/contracts';
import { DomainError } from './errors.js';
import { uuidSchema } from './validation.js';

export const workflowHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().positive().max(WORKFLOW_PAGE_SIZE).default(WORKFLOW_PAGE_SIZE),
  cursor: uuidSchema.optional(),
});

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
