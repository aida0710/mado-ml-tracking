import { z } from 'zod';
import { nameSchema } from './validation.js';

// Same limit as namedEntitySchema, which these entities were created with.
const descriptionSchema = z.string().max(20000);

function requireSomeField(input: object): boolean {
  return Object.values(input).some((value) => value !== undefined);
}
const EMPTY_PATCH_MESSAGE = 'specify at least one field to change';

// Name and family stay fixed: MLflow clients and automation rules find a Model by them.
export const modelPatchSchema = z
  .strictObject({ description: descriptionSchema.optional() })
  .refine(requireSomeField, EMPTY_PATCH_MESSAGE);
export type ModelPatch = z.infer<typeof modelPatchSchema>;

export const experimentPatchSchema = z
  .strictObject({ name: nameSchema.optional(), description: descriptionSchema.optional() })
  .refine(requireSomeField, EMPTY_PATCH_MESSAGE);
export type ExperimentPatch = z.infer<typeof experimentPatchSchema>;

export const datasetPatchSchema = z
  .strictObject({ archived: z.boolean().optional(), description: descriptionSchema.optional() })
  .refine(requireSomeField, EMPTY_PATCH_MESSAGE);
export type DatasetPatch = z.infer<typeof datasetPatchSchema>;

// Omitted lists every Dataset: the Datasets screen shows archived ones on request from that list.
export const datasetListQuerySchema = z.strictObject({
  archived: z.enum(['true', 'false']).optional(),
});
export type DatasetListQuery = z.infer<typeof datasetListQuerySchema>;
