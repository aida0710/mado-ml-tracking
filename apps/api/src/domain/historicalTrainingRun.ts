import { isDeepStrictEqual } from 'node:util';
import type { Run } from '@mmt/contracts';
import type { z } from 'zod';
import type { historicalTrainingRunSchema } from './modelTrainingSourceValidation.js';

/** A resend may reuse its recorded history; another recipe must not replace the association. */
export function matchesHistoricalTrainingRun(
  run: Run,
  input: z.infer<typeof historicalTrainingRunSchema>,
): boolean {
  const environment = { ...run.environment };
  if (!Object.hasOwn(input.environment, 'runtime')) delete environment.runtime;
  return (
    run.status === 'finished' &&
    run.name === input.name &&
    run.kind === input.kind &&
    run.experimentId === input.experimentId &&
    run.modelVersionId === (input.modelVersionId ?? null) &&
    (!input.codeVersionId || run.codeVersionId === input.codeVersionId) &&
    run.parentRunId === (input.parentRunId ?? null) &&
    run.startedAt === input.startedAt &&
    run.endedAt === input.endedAt &&
    isDeepStrictEqual(run.parameters, input.parameters) &&
    isDeepStrictEqual(run.tags, input.tags) &&
    isDeepStrictEqual(environment, input.environment) &&
    isDeepStrictEqual(
      [...run.inputDatasetVersionIds].sort(),
      [...input.inputDatasetVersionIds].sort(),
    )
  );
}
