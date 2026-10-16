import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

async function listen(app: Hono) {
  let server: ReturnType<typeof serve>;
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (address) =>
      resolve(address.port),
    );
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/** Real Mado HTTP routes with isolated Registry responses; no production API or DB is contacted. */
export async function startMadoVerificationServer() {
  const madoRoot = process.env.MMT_VERIFY_MADO_ROOT ?? path.resolve('../mado');
  const { mountServiceLineageRoutes } = await import(
    pathToFileURL(path.join(madoRoot, 'api/routes/service-lineage.ts')).href
  );
  const { mountOpenLineageRoutes } = await import(
    pathToFileURL(path.join(madoRoot, 'api/routes/openlineage.ts')).href
  );
  const { mountMetricsRoutes } = await import(
    pathToFileURL(path.join(madoRoot, 'api/routes/metrics.ts')).href
  );
  const { mountServiceAccessTokenRoutes } = await import(
    pathToFileURL(path.join(madoRoot, 'api/routes/service-access-token.ts')).href
  );

  const datasetId = randomUUID(),
    versionId = randomUUID();
  const version = {
    id: versionId,
    datasetId,
    version: 'v1',
    contentHash: `sha256:${createHash('sha256').update('mado-verification-fixture').digest('hex')}`,
    manifestUri: null,
    manifestHash: null,
    schemaUri: null,
    createdAt: new Date().toISOString(),
    metadata: { secret: 'private-fixture' },
    locations: [
      {
        id: randomUUID(),
        uri: 's3://fixtures/corpus/v1',
        status: 'available',
        storageKind: 's3',
        isPrimary: true,
      },
    ],
  };
  const dataset = {
    datasetId,
    namespace: 'speech',
    name: 'fixture-corpus',
    displayName: 'Fixture Corpus',
    description: '',
    mediaType: 'audio',
    currentVersionId: versionId,
    versionCount: 1,
    createdAt: version.createdAt,
    versions: [version],
  };
  // One access token reads datasets, sends run records and reads capacity, like Mado's ML Tracking preset.
  const accessToken = randomBytes(24).toString('hex');
  const principal = {
    serviceAccountId: randomUUID(),
    keyId: randomUUID(),
    keyName: 'ML Tracking verification',
    scopes: ['lineage:read', 'lineage:write', 'metrics:read'],
    namespaces: ['speech', 'mado-model-tracking', 'local'],
    expiresAt: null,
  };
  const authenticate = async (token: string) => (token === accessToken ? principal : null);
  const events: Array<{
    eventType: string;
    inputs: Array<{ name: string; namespace: string; facets: unknown }>;
    outputs: Array<{ name: string; namespace: string; facets: unknown }>;
  }> = [];
  const registry = {
    searchDatasets: async (query: { namespace?: string }) =>
      !query.namespace || query.namespace === dataset.namespace
        ? { results: [dataset], totalCount: 1 }
        : { results: [], totalCount: 0 },
    getDataset: async () => dataset,
    getVersion: async () => version,
    ingestOpenLineage: async (event: (typeof events)[number]) => {
      events.push(event);
      return { accepted: true, duplicate: false };
    },
  };
  const mado = new Hono(),
    madoPrivate = new Hono();
  mountServiceAccessTokenRoutes(madoPrivate, { authenticate });
  mountServiceLineageRoutes(madoPrivate, { registry, authenticate });
  mountMetricsRoutes(madoPrivate, {
    authenticate,
    collectors: [
      {
        name: 'capacity',
        collect: async () => [
          {
            name: 'mado_storage_bucket_bytes',
            help: 'Fixture bytes',
            type: 'gauge',
            samples: [
              {
                labels: { connection_id: 'fixture', bucket: 'corpus' },
                value: '1048576',
              },
            ],
          },
        ],
      },
    ],
  });
  mado.route('/api/mado', madoPrivate);
  const lineage = new Hono();
  mountOpenLineageRoutes(lineage, { registry, auth: { authenticate } });
  mado.route('/api', lineage);
  const server = await listen(mado);
  return { ...server, events, accessToken, datasetId, versionId };
}
