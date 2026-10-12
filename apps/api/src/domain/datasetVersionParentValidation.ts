import { z } from 'zod';
import { jsonObjectSchema, uuidSchema } from './validation.js';

// Match the Run input bound; provenance references fit in a small configuration record.
const MAX_PARENT_ADDITION_VERSIONS = 1000;
// Evidence describes the comparison, rather than containing the compared files.
const MAX_PARENT_ADDITION_EVIDENCE_BYTES = 64 * 1024;
// A reason is a short explanation; longer proof belongs in structured evidence.
const MAX_PARENT_ADDITION_REASON_LENGTH = 2000;

export const datasetVersionParentCreateSchema = z.strictObject({
  parentDatasetVersionIds: z
    .array(uuidSchema.transform((id) => id.toLowerCase()))
    .min(1)
    .max(MAX_PARENT_ADDITION_VERSIONS)
    .refine((ids) => new Set(ids).size === ids.length, 'Parent versions must be unique')
    .transform((ids) => ids.sort()),
  reason: z.string().trim().min(1).max(MAX_PARENT_ADDITION_REASON_LENGTH),
  evidence: jsonObjectSchema
    .refine((evidence) => Object.keys(evidence).length > 0, 'Evidence is required')
    .refine(
      (evidence) =>
        Buffer.byteLength(JSON.stringify(evidence)) <= MAX_PARENT_ADDITION_EVIDENCE_BYTES,
      'Parent addition evidence is too large',
    ),
});

export type DatasetVersionParentCreateInput = z.infer<typeof datasetVersionParentCreateSchema>;
