import { z } from 'zod';
import { jsonObjectSchema, runCreateSchema, uuidSchema } from './validation.js';

// Evidence holds a recipe reference and checksums, rather than the training files themselves.
const MAX_TRAINING_SOURCE_EVIDENCE_BYTES = 64 * 1024;

const evidenceSchema = jsonObjectSchema
  .refine(
    (evidence) => Buffer.byteLength(JSON.stringify(evidence)) <= MAX_TRAINING_SOURCE_EVIDENCE_BYTES,
    'Training source evidence is too large',
  )
  .default({});

export const historicalTrainingRunSchema = runCreateSchema
  .omit({ resumeCheckpointId: true, executionMode: true })
  .extend({
    kind: z.enum(['training', 'finetuning']),
    startedAt: z.iso
      .datetime({ offset: true })
      .nullish()
      .transform((value) => (value ? new Date(value).toISOString() : null)),
    endedAt: z.iso
      .datetime({ offset: true })
      .nullish()
      .transform((value) => (value ? new Date(value).toISOString() : null)),
  })
  .refine(
    (run) => !run.startedAt || !run.endedAt || run.startedAt <= run.endedAt,
    'Training must end after it starts',
  )
  .refine(
    (run) =>
      [run.startedAt, run.endedAt].every((value) => !value || Date.parse(value) <= Date.now()),
    'Historical training dates must be in the past',
  );

export const modelTrainingSourceCreateSchema = z.union([
  z.strictObject({
    runId: uuidSchema.transform((id) => id.toLowerCase()),
    evidence: evidenceSchema,
  }),
  z.strictObject({ run: historicalTrainingRunSchema, evidence: evidenceSchema }),
]);

export type ModelTrainingSourceCreateInput = z.infer<typeof modelTrainingSourceCreateSchema>;
