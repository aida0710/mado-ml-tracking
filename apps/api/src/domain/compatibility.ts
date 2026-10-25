import type { CodeVersion, ModelVersion, RunKind } from '@mmt/contracts';
import { DomainError } from './errors.js';

export function validateCodeCompatibility(
  code: CodeVersion,
  execution: { model: Pick<ModelVersion, 'family'> | null; kind?: RunKind },
): void {
  if (execution.model && !code.supportedModelFamilies.includes(execution.model.family)) {
    throw new DomainError({
      status: 422,
      code: 'incompatible_model_family',
      message: `the code version does not support model family ${execution.model.family}`,
      details: { modelFamily: execution.model.family },
    });
  }
  if (execution.kind && !code.taskTypes.includes(execution.kind)) {
    throw new DomainError({
      status: 422,
      code: 'incompatible_task_type',
      message: `the code version does not support run kind ${execution.kind}`,
      details: { runKind: execution.kind },
    });
  }
}
