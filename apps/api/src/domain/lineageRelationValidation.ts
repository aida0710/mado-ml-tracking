import { z } from 'zod';
import { jsonObjectSchema, uuidSchema } from './validation.js';

// 過去の関係のevidenceは小さな証拠の記録。中身のデータはArtifactの保存先に置いたままにする。
const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_REASON_LENGTH = 2000;
const nodeKind = z.enum(['run', 'modelVersion', 'datasetVersion']);
const nodeId = uuidSchema.transform((id) => id.toLowerCase());
export const lineageRelationCreateSchema = z.strictObject({
  sourceId: nodeId,
  sourceKind: nodeKind,
  targetId: nodeId,
  targetKind: nodeKind,
  relation: z.enum(['input', 'output', 'model', 'parentRun', 'reference']),
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
  evidence: jsonObjectSchema.refine(
    (value) => Object.keys(value).length > 0 && Buffer.byteLength(JSON.stringify(value)) <= MAX_EVIDENCE_BYTES,
    'A nonempty, bounded evidence record is required',
  ),
}).refine((value) => value.sourceId !== value.targetId, 'A node cannot reference itself')
  .refine((value) => value.relation === 'reference' || {
    input: 'datasetVersion:run',
    output: 'run:datasetVersion',
    model: 'modelVersion:run',
    parentRun: 'run:run',
  }[value.relation] === `${value.sourceKind}:${value.targetKind}`, 'Node kinds do not match the relation');

export type LineageRelationCreateInput = z.infer<typeof lineageRelationCreateSchema>;
