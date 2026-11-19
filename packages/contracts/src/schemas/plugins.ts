import { z } from 'zod';
import type { DataCatalogPlugin, LineageGraph } from '../index.js';
import { timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const dataCatalogAccessTokenGrantSchema = namedContractSchema(
  'DataCatalogAccessTokenGrant',
  z.strictObject({
    name: z.string(),
    scopes: z.array(z.string()),
    expiresAt: timestampSchema.nullable(),
  }),
);
export const dataCatalogConnectionSchema = namedContractSchema(
  'DataCatalogConnection',
  z.strictObject({
    url: z.string(),
    accessTokenGrant: dataCatalogAccessTokenGrantSchema,
    checkedAt: timestampSchema,
  }),
);
export const dataCatalogPluginSchema = namedContractSchema(
  'DataCatalogPlugin',
  z.strictObject({
    connection: dataCatalogConnectionSchema.nullable(),
    secretStorageAvailable: z.boolean(),
  }),
);
/** GET /admin/plugins/data-catalog/capacity: 容量のmetricsをPrometheusのテキスト形式で表したもの。 */
export const dataCatalogCapacityResponseSchema = z.strictObject({ prometheus: z.string() });
export const lineageGraphSchema = namedContractSchema(
  'LineageGraph',
  z.strictObject({
    nodes: z.array(
      z.strictObject({
        id: z.string(),
        kind: z.enum(['datasetVersion', 'modelVersion', 'loggedModel', 'run', 'codeVersion']),
        label: z.string(),
        status: z.string().optional(),
        sourceRunId: z.string().optional(),
      }),
    ),
    edges: z.array(
      z.strictObject({ source: z.string(), target: z.string(), relation: z.string() }),
    ),
  }),
);

type _DataCatalogPlugin = Expect<
  MutuallyAssignable<z.infer<typeof dataCatalogPluginSchema>, DataCatalogPlugin>
>;
type _LineageGraph = Expect<MutuallyAssignable<z.infer<typeof lineageGraphSchema>, LineageGraph>>;
