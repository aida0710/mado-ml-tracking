import { z } from 'zod';
import type { OperationsAlert } from '../operations.js';
import { idSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const operationsAlertSchema = namedContractSchema(
  'OperationsAlert',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    kind: z.enum(['job.heartbeat_stale', 'worker.offline', 'plugin.delivery_stalled']),
    subjectId: z.string(),
    openedAt: timestampSchema,
    resolvedAt: timestampSchema.nullable(),
    resolution: z.enum(['recovered', 'inactive']).nullable(),
    detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  }),
);
type _OperationsAlert = Expect<
  MutuallyAssignable<z.infer<typeof operationsAlertSchema>, OperationsAlert>
>;
