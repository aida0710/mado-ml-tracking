import { z } from 'zod';
import { jsonObjectSchema, uuidSchema } from './validation.js';

// stageは構成の記録で、データセットのmanifestや学習のログではない。
const MAX_STAGE_METADATA_BYTES = 64 * 1024;
// 既存のRunの入力の上限に合わせる。
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
