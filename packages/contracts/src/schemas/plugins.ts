import { z } from 'zod';
import type {
  DataCatalogPlugin,
  DataCatalogReference,
  LineageGraph,
  StorageConnectionReassignmentResult,
  StorageConnectionUsage,
} from '../index.js';
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
export const dataCatalogStorageConnectionSchema = namedContractSchema(
  'DataCatalogStorageConnection',
  z.strictObject({ id: z.string(), name: z.string(), provider: z.string() }),
);
export const dataCatalogReferenceSchema = namedContractSchema(
  'DataCatalogReference',
  z.strictObject({
    url: z.string().nullable(),
    storageConnections: z.array(dataCatalogStorageConnectionSchema),
  }),
);
export const storageConnectionUsageSchema = namedContractSchema(
  'StorageConnectionUsage',
  z.strictObject({
    bucket: z.string(),
    dataCatalogStorageConnectionId: z.string().nullable(),
    datasetVersions: z.number().int(),
    modelVersions: z.number().int(),
  }),
);
export const storageConnectionReassignmentResultSchema = namedContractSchema(
  'StorageConnectionReassignmentResult',
  z.strictObject({ datasetVersions: z.number().int(), modelVersions: z.number().int() }),
);
export const dataCatalogConnectionSchema = namedContractSchema(
  'DataCatalogConnection',
  z.strictObject({
    url: z.string(),
    accessTokenGrant: dataCatalogAccessTokenGrantSchema,
    storageConnections: z.array(dataCatalogStorageConnectionSchema),
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
type _StorageConnectionUsage = Expect<
  MutuallyAssignable<z.infer<typeof storageConnectionUsageSchema>, StorageConnectionUsage>
>;
type _StorageConnectionReassignmentResult = Expect<
  MutuallyAssignable<
    z.infer<typeof storageConnectionReassignmentResultSchema>,
    StorageConnectionReassignmentResult
  >
>;
type _DataCatalogReference = Expect<
  MutuallyAssignable<z.infer<typeof dataCatalogReferenceSchema>, DataCatalogReference>
>;
type _LineageGraph = Expect<MutuallyAssignable<z.infer<typeof lineageGraphSchema>, LineageGraph>>;
