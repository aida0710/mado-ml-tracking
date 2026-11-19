/**
 * 使い捨ての本物のmado ML TrackingのAPIとDB。fixtureの認証と容量の値を付けた本物の
 * mado S3 Data Catalogの経路と並べて動かす。
 */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import type { Project } from '@mmt/contracts';
import { createHarness, entity, request } from '../apps/api/test/harness.js';
import { startDataCatalogVerificationServer } from './fixtures/dataCatalogVerificationServer.js';

// 専用のポートを使い、共有の開発用サーバーとこの検証を分ける。
const DEFAULT_VERIFICATION_API_PORT = 6083;
const DEFAULT_VERIFICATION_WEB_PORT = 6084;
const port = Number(process.env.MMT_VERIFY_API_PORT ?? DEFAULT_VERIFICATION_API_PORT);
const webPort = Number(process.env.MMT_VERIFY_WEB_PORT ?? DEFAULT_VERIFICATION_WEB_PORT);
const dataCatalog = await startDataCatalogVerificationServer();
const settingsFile = path.resolve('var/data-catalog-verification.json');
let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
let server: ReturnType<typeof serve> | undefined;
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const activeServer = server;
  if (activeServer)
    await new Promise<void>((resolve, reject) =>
      activeServer.close((error) => (error ? reject(error) : resolve())),
    );
  await harness?.close();
  await dataCatalog.close();
  await unlink(settingsFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

try {
  harness = await createHarness({
    environment: {
      MMT_PUBLIC_URL: `http://127.0.0.1:${port}`,
      MMT_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
      MMT_PLUGIN_SECRET_KEY: randomBytes(32).toString('base64'),
    },
  });
  const originHeaders = { Origin: `http://127.0.0.1:${webPort}` };
  const loginResponse = await request(harness.app, '/api/auth/dev-login', {
    method: 'POST',
    body: { email: 'admin@localhost' },
    headers: originHeaders,
  });
  await entity(loginResponse, 200);
  const administrator = { cookie: loginResponse.headers.get('Set-Cookie')!.split(';')[0]! };
  const project = await entity<Project>(
    await request(harness.app, '/api/projects', {
      method: 'POST',
      cookie: administrator.cookie,
      headers: originHeaders,
      body: { name: 'Pluginsの確認' },
    }),
  );
  // ローカルのブラウザでの検証が、この短期間だけ有効なfixtureの認証情報を読む。コンソールへの
  // 出力やスクリーンショットには決して出さない。
  await mkdir(path.dirname(settingsFile), { recursive: true, mode: 0o700 });
  await writeFile(
    settingsFile,
    JSON.stringify({
      projectId: project.id,
      dataCatalogUrl: dataCatalog.url,
      accessToken: dataCatalog.accessToken,
    }),
    { mode: 0o600 },
  );
  server = serve({ hostname: '127.0.0.1', port, fetch: harness.app.fetch });
  console.log(JSON.stringify({ event: 'data_catalog_verification_ready', port, projectId: project.id }));
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
} catch (error) {
  await shutdown();
  throw error;
}
