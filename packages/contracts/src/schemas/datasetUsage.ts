import type { DatasetUsage, RunDatasetUsage } from '../datasetUsage.js';
import { z } from 'zod';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';
import { DATASET_USAGE_ROLES } from '../datasetUsage.js';
import { idSchema, jsonObjectSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';

export const datasetUsageRoleSchema = z.enum(DATASET_USAGE_ROLES);
export const datasetUsageSchema = namedContractSchema(
  'DatasetUsage',
  z.strictObject({
    datasetVersionId: idSchema,
    role: datasetUsageRoleSchema,
    weight: z.number().positive().finite(),
    selection: jsonObjectSchema,
  }),
);
export const runDatasetUsageSchema = namedContractSchema(
  'RunDatasetUsage',
  z.strictObject({
    items: z.array(datasetUsageSchema),
  }),
);

type _DatasetUsage = Expect<MutuallyAssignable<z.infer<typeof datasetUsageSchema>, DatasetUsage>>;

type _RunDatasetUsage = Expect<
  MutuallyAssignable<z.infer<typeof runDatasetUsageSchema>, RunDatasetUsage>
>;
