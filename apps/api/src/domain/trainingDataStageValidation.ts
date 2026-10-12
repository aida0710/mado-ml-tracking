import { z } from 'zod';
import { jsonObjectSchema, uuidSchema } from './validation.js';

// A stage is a configuration record, not a dataset manifest or a training log.
const MAX_STAGE_METADATA_BYTES = 64 * 1024;
// Match the existing Run input limit.
const MAX_STAGE_DATASETS = 1000;

export const trainingDataStageCreateSchema = z.strictObject({
  startStep: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  inputDatasetVersionIds: z
    .array(uuidSchema.transform((id) => id.toLowerCase()))
    .min(1)
    .max(MAX_STAGE_DATASETS)
    .refine((ids) => new Set(ids).size === ids.length, 'Dataset versions must be unique'),
  checkpointId: uuidSchema
    .transform((id) => id.toLowerCase())
    .nullish()
    .transform((id) => id ?? null),
  metadata: jsonObjectSchema
    .refine(
      (metadata) => Buffer.byteLength(JSON.stringify(metadata)) <= MAX_STAGE_METADATA_BYTES,
      'Stage metadata is too large',
    )
    .default({}),
});

export type TrainingDataStageCreateInput = z.infer<typeof trainingDataStageCreateSchema>;
