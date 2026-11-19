import { z } from 'zod';
import type {
  LineageGraph,
  PluginConnection,
  PluginManifest,
  MadoAccessTokenGrant,
  MadoPluginConfig,
} from '../index.js';
import { idSchema, timestampSchema } from './primitives.js';
import { namedContractSchema } from './schemaRegistry.js';
import type { Expect, MutuallyAssignable } from './typeAssertions.js';

export const pluginManifestSchema = namedContractSchema(
  'PluginManifest',
  z.strictObject({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    protocolVersion: z.literal('1.0'),
    capabilities: z.array(z.string()),
  }),
);
export const madoPluginConfigSchema = namedContractSchema(
  'MadoPluginConfig',
  z.strictObject({
    apiUrl: z.string(),
    webUrl: z.string(),
  }),
);
export const madoAccessTokenGrantSchema = namedContractSchema(
  'MadoAccessTokenGrant',
  z.strictObject({
    name: z.string(),
    scopes: z.array(z.string()),
    expiresAt: timestampSchema.nullable(),
  }),
);
export const pluginConnectionSchema = namedContractSchema(
  'PluginConnection',
  z.strictObject({
    id: idSchema,
    projectId: idSchema,
    name: z.string(),
    kind: z.literal('mado'),
    config: madoPluginConfigSchema,
    configRevision: z.number().int(),
    credentialsConfigured: z.strictObject({ accessToken: z.boolean() }),
    secretStorageAvailable: z.boolean(),
    tokenConfigured: z.boolean(),
    enabled: z.boolean(),
    manifest: pluginManifestSchema.nullable(),
    accessTokenGrant: madoAccessTokenGrantSchema.nullable(),
    createdAt: timestampSchema,
  }),
);
/** GET /projects/:p/plugins/:id/metrics: pluginのmetricsをPrometheusのテキスト形式で表したもの。 */
export const pluginMetricsResponseSchema = z.strictObject({ prometheus: z.string() });
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

type _PluginManifest = Expect<
  MutuallyAssignable<z.infer<typeof pluginManifestSchema>, PluginManifest>
>;
type _PluginConnection = Expect<
  MutuallyAssignable<z.infer<typeof pluginConnectionSchema>, PluginConnection>
>;
type _LineageGraph = Expect<MutuallyAssignable<z.infer<typeof lineageGraphSchema>, LineageGraph>>;

type _MadoConfig = Expect<
  MutuallyAssignable<z.infer<typeof madoPluginConfigSchema>, MadoPluginConfig>
>;
type _MadoAccessTokenGrant = Expect<
  MutuallyAssignable<z.infer<typeof madoAccessTokenGrantSchema>, MadoAccessTokenGrant>
>;
