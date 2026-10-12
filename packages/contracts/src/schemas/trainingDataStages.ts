import { z } from 'zod';
import type { TrainingDataStage, TrainingDataStagePage } from '../trainingDataStages.js';
import { idSchema, jsonObjectSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const trainingDataStageSchema = namedContractSchema(
  'TrainingDataStage',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    runId: idSchema,
    startStep: z.number().int().nonnegative(),
    inputDatasetVersionIds: z.array(idSchema),
    checkpointId: idSchema.nullable(),
    metadata: jsonObjectSchema,
    createdBy: idSchema,
    createdAt: timestampSchema,
  }),
);

export const trainingDataStagePageSchema = namedContractSchema(
  'TrainingDataStagePage',
  z.strictObject({
    initialStep: z.number().int().nonnegative(),
    initialDatasetVersionIds: z.array(idSchema),
    items: z.array(trainingDataStageSchema),
  }),
);

type _TrainingDataStage = Expect<
  MutuallyAssignable<z.infer<typeof trainingDataStageSchema>, TrainingDataStage>
>;
type _TrainingDataStagePage = Expect<
  MutuallyAssignable<z.infer<typeof trainingDataStagePageSchema>, TrainingDataStagePage>
>;
