import { z } from 'zod';
import type { ArtifactReferences } from '../artifactReferences.js';
import { idSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const artifactReferencesSchema = namedContractSchema(
  'ArtifactReferences',
  z.strictObject({
    artifactId: idSchema,
    modelVersions: z.array(
      z.strictObject({ id: idSchema, modelId: idSchema, modelName: z.string(), version: z.string() }),
    ),
    datasetVersions: z.array(
      z.strictObject({
        id: idSchema,
        datasetId: idSchema,
        datasetName: z.string(),
        version: z.string(),
        path: z.string(),
      }),
    ),
    codeVersions: z.array(
      z.strictObject({ id: idSchema, codeId: idSchema, codeName: z.string(), version: z.string() }),
    ),
    checkpoints: z.array(
      z.strictObject({ id: idSchema, runId: idSchema, runName: z.string(), step: z.number().int() }),
    ),
    preprocessingReports: z.array(z.strictObject({ runId: idSchema, runName: z.string() })).optional(),
  }),
);

type _ArtifactReferences = Expect<
  MutuallyAssignable<z.infer<typeof artifactReferencesSchema>, ArtifactReferences>
>;
