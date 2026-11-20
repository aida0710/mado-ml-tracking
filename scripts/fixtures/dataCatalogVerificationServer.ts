import { randomBytes, randomUUID } from 'node:crypto';
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

/** fixtureのmado S3 Data Catalogが持つストレージ接続。 */
export const DATA_CATALOG_VERIFICATION_STORAGE_CONNECTION = {
  id: 'fixture',
  name: 'fixture storage',
  provider: 'onprem',
};

/** 容量の応答に入る、fixtureのバケットの大きさ。検証する側が応答の中身をこの値で確かめる。 */
export const DATA_CATALOG_VERIFICATION_BUCKET_BYTES = '1048576';

/**
 * 本物のmado S3 Data CatalogのHTTPの経路（アクセストークン自身の情報、ストレージ接続の一覧、
 * 容量メトリクス）に、fixtureの認証・ストレージ接続・容量の値を付けたもの。本番のAPIやDBには接続しない。
 */
export async function startDataCatalogVerificationServer() {
  const dataCatalogRoot = process.env.MMT_VERIFY_DATA_CATALOG_ROOT ?? path.resolve('../mado');
  const { mountMetricsRoutes } = await import(
    pathToFileURL(path.join(dataCatalogRoot, 'api/routes/metrics.ts')).href
  );
  const { mountServiceConnectionsRoutes } = await import(
    pathToFileURL(path.join(dataCatalogRoot, 'api/routes/service-connections.ts')).href
  );
  const { mountServiceAccessTokenRoutes } = await import(
    pathToFileURL(path.join(dataCatalogRoot, 'api/routes/service-access-token.ts')).href
  );

  // ストレージ接続と容量の読み取りを許したアクセストークン。
  const accessToken = randomBytes(24).toString('hex');
  const principal = {
    serviceAccountId: randomUUID(),
    keyId: randomUUID(),
    keyName: 'ML Tracking verification',
    scopes: ['metrics:read'],
    // 一覧と容量は、tokenに載っている接続だけを読む。このtokenはすべての接続を持つ。
    connections: ['*'],
    expiresAt: null,
  };
  const authenticate = async (token: string) => (token === accessToken ? principal : null);
  const serviceRoutes = new Hono();
  mountServiceAccessTokenRoutes(serviceRoutes, { authenticate });
  mountServiceConnectionsRoutes(serviceRoutes, {
    authenticate,
    connections: { list: async () => [DATA_CATALOG_VERIFICATION_STORAGE_CONNECTION] },
  });
  mountMetricsRoutes(serviceRoutes, {
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
                labels: {
                  connection_id: DATA_CATALOG_VERIFICATION_STORAGE_CONNECTION.id,
                  bucket: 'corpus',
                },
                value: DATA_CATALOG_VERIFICATION_BUCKET_BYTES,
              },
            ],
          },
        ],
      },
    ],
  });
  // 本物と同じく、画面のURLの下の/api/mado/で配る。
  const dataCatalog = new Hono();
  dataCatalog.route('/api/mado', serviceRoutes);
  const server = await listen(dataCatalog);
  return { ...server, accessToken, tokenName: principal.keyName };
}
