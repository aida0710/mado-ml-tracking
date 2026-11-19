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

/** 容量の応答に入る、fixtureのバケットの大きさ。検証する側が応答の中身をこの値で確かめる。 */
export const MADO_VERIFICATION_BUCKET_BYTES = '1048576';

/**
 * 本物のmado S3 Data CatalogのHTTPの経路（アクセストークン自身の情報と容量メトリクス）に、
 * fixtureの認証と容量の値を付けたもの。本番のAPIやDBには接続しない。
 */
export async function startMadoVerificationServer() {
  const madoRoot = process.env.MMT_VERIFY_MADO_ROOT ?? path.resolve('../mado');
  const { mountMetricsRoutes } = await import(
    pathToFileURL(path.join(madoRoot, 'api/routes/metrics.ts')).href
  );
  const { mountServiceAccessTokenRoutes } = await import(
    pathToFileURL(path.join(madoRoot, 'api/routes/service-access-token.ts')).href
  );

  // 容量の読み取りを許したアクセストークン。
  const accessToken = randomBytes(24).toString('hex');
  const principal = {
    serviceAccountId: randomUUID(),
    keyId: randomUUID(),
    keyName: 'ML Tracking verification',
    scopes: ['metrics:read'],
    // 容量のメトリクスはtokenに載っている接続だけを読む。このtokenはすべての接続を持つ。
    connections: ['*'],
    // mado S3 Data Catalog v0.5.3までの経路は、これを応答に載せる。v0.6.0以降の経路は読まない。
    namespaces: ['*'],
    expiresAt: null,
  };
  const authenticate = async (token: string) => (token === accessToken ? principal : null);
  const madoPrivate = new Hono();
  mountServiceAccessTokenRoutes(madoPrivate, { authenticate });
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
                value: MADO_VERIFICATION_BUCKET_BYTES,
              },
            ],
          },
        ],
      },
    ],
  });
  const mado = new Hono();
  mado.route('/api/mado', madoPrivate);
  const server = await listen(mado);
  return { ...server, accessToken, tokenName: principal.keyName };
}
