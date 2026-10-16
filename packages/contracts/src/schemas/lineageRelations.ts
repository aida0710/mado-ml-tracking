import { z } from 'zod';
import { idSchema, jsonObjectSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';

const nodeKind = z.enum(['run', 'modelVersion', 'datasetVersion']);
export const lineageRelationAdditionSchema = namedContractSchema('LineageRelationAddition',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    sourceId: idSchema,
    sourceKind: nodeKind,
    targetId: idSchema,
    targetKind: nodeKind,
    relation: z.enum(['input', 'output', 'model', 'parentRun', 'reference']),
    reason: z.string(),
    evidence: jsonObjectSchema,
    createdBy: idSchema,
    createdAt: timestampSchema,
  }),
);

export const lineageRelationPageSchema = namedContractSchema('LineageRelationPage',
  z.strictObject({ items: z.array(lineageRelationAdditionSchema) }),
);
