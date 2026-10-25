import { z } from 'zod';
import { jsonObjectSchema, uuidSchema } from './validation.js';

// Runの入力と同じ上限にする。来歴の参照は小さな設定のレコードに収まる。
const MAX_PARENT_ADDITION_VERSIONS = 1000;
// evidenceは比較を説明するもので、比べたファイルそのものを入れる場所ではない。
const MAX_PARENT_ADDITION_EVIDENCE_BYTES = 64 * 1024;
// reasonは短い説明。長い裏付けは構造化したevidenceに書く。
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
