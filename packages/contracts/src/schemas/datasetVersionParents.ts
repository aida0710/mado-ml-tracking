import { z } from 'zod';
import type {
  DatasetVersionParentAddition,
  DatasetVersionParentPage,
} from '../datasetVersionParents.js';
import { idSchema, jsonObjectSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const datasetVersionParentAdditionSchema = namedContractSchema(
  'DatasetVersionParentAddition',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    datasetVersionId: idSchema,
    parentDatasetVersionId: idSchema,
    reason: z.string(),
    evidence: jsonObjectSchema,
    createdBy: idSchema,
    createdByName: z.string(),
    createdAt: timestampSchema,
  }),
);

export const datasetVersionParentPageSchema = namedContractSchema(
  'DatasetVersionParentPage',
  z.strictObject({
    registeredParentDatasetVersionIds: z.array(idSchema),
    parentDatasetVersionIds: z.array(idSchema),
    items: z.array(datasetVersionParentAdditionSchema),
  }),
);

type _DatasetVersionParentAddition = Expect<
  MutuallyAssignable<
    z.infer<typeof datasetVersionParentAdditionSchema>,
    DatasetVersionParentAddition
  >
>;
type _DatasetVersionParentPage = Expect<
  MutuallyAssignable<z.infer<typeof datasetVersionParentPageSchema>, DatasetVersionParentPage>
>;
