import { z } from 'zod';
import type { ModelVersionTrainingSource } from '../modelTrainingSources.js';
import { idSchema, jsonObjectSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const modelVersionTrainingSourceSchema = namedContractSchema(
  'ModelVersionTrainingSource',
  z.strictObject({
    projectId: idSchema,
    modelId: idSchema,
    modelVersionId: idSchema,
    runId: idSchema,
    origin: z.enum(['registration', 'association']),
    evidence: jsonObjectSchema,
    createdBy: idSchema.nullable(),
    createdAt: timestampSchema,
  }),
);

export const modelVersionTrainingSourceResponseSchema = namedContractSchema(
  'ModelVersionTrainingSourceResponse',
  z.strictObject({ source: modelVersionTrainingSourceSchema.nullable() }),
);

type _ModelVersionTrainingSource = Expect<
  MutuallyAssignable<z.infer<typeof modelVersionTrainingSourceSchema>, ModelVersionTrainingSource>
>;
