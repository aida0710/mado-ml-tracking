/**
 * 組み込みのmado S3 Data Catalogのクライアントと本物のhostを、fixtureの認証と容量の値を付けた
 * mado S3 Data CatalogのHTTPの経路につなぐ。
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PluginConnection, Project } from '@mmt/contracts';
import { createApplication } from '../apps/api/src/app.js';
import { createHarness, entity, login, request } from '../apps/api/test/harness.js';
import {
  MADO_VERIFICATION_BUCKET_BYTES,
  startMadoVerificationServer,
} from './fixtures/madoVerificationServer.js';

const madoServer = await startMadoVerificationServer();
const harness = await createHarness();
const host = createApplication({
  config: harness.config,
  database: harness.database,
  stores: harness.stores,
});
try {
  const administrator = await login(harness);
  const project = await entity<Project>(
    await request(host.app, '/api/projects', {
      method: 'POST',
      cookie: administrator.cookie,
      body: { name: 'Mado integration fixture' },
    }),
  );
  const basePath = `/api/projects/${project.id}`;
  const connectionInput = (accessToken: string) => ({
    kind: 'mado',
    name: 'Mado',
    config: { apiUrl: madoServer.url, webUrl: madoServer.url },
    credentials: { accessToken },
  });
  const plugin = await entity<PluginConnection>(
    await request(host.app, `${basePath}/plugins`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: connectionInput(madoServer.accessToken),
    }),
  );
  assert.equal(plugin.enabled, false);
  const checked = await entity<PluginConnection>(
    await request(host.app, `${basePath}/plugins/${plugin.id}/check`, {
      method: 'POST',
      cookie: administrator.cookie,
    }),
    200,
  );
  // 保存するのは名前・scope・有効期限だけ。mado S3 Data Catalogが返すtokenのIDは残さない。
  assert.deepEqual(checked.accessTokenGrant, {
    name: madoServer.tokenName,
    scopes: ['metrics:read'],
    expiresAt: null,
  });
  assert.deepEqual(checked.manifest?.capabilities, ['storage:metrics']);
  const metricsPath = `${basePath}/plugins/${plugin.id}/metrics`;
  const disabledMetrics = await request(host.app, metricsPath, { cookie: administrator.cookie });
  assert.equal(disabledMetrics.status, 422, 'A disabled connection must not read capacity');
  await entity<PluginConnection>(
    await request(host.app, `${basePath}/plugins/${plugin.id}`, {
      method: 'PATCH',
      cookie: administrator.cookie,
      body: { enabled: true, expectedRevision: plugin.configRevision },
    }),
    200,
  );
  const metrics = await entity<{ prometheus: string }>(
    await request(host.app, metricsPath, { cookie: administrator.cookie }),
    200,
  );
  assert(metrics.prometheus.includes('mado_storage_bucket_bytes'));
  assert(metrics.prometheus.includes(MADO_VERIFICATION_BUCKET_BYTES));

  // mado S3 Data Catalogが知らないtokenは、接続の確認で失敗する。
  const rejected = await entity<PluginConnection>(
    await request(host.app, `${basePath}/plugins`, {
      method: 'POST',
      cookie: administrator.cookie,
      body: { ...connectionInput('unknown-fixture-token'), name: 'Unknown token' },
    }),
  );
  const rejectedCheck = await request(host.app, `${basePath}/plugins/${rejected.id}/check`, {
    method: 'POST',
    cookie: administrator.cookie,
  });
  assert.equal(rejectedCheck.status, 502);
  assert(!(await rejectedCheck.text()).includes('unknown-fixture-token'));

  const summary = {
    checks: [
      "access token name, scopes and expiration read from Mado's /api/mado/access-token",
      'token ID returned by Mado is not stored',
      'Mado metrics:read through built-in client and host API',
      'a disabled connection does not read capacity',
      'a token unknown to Mado fails the connection check without leaking the token',
    ],
    mado: 'real Mado routes with fixture authentication and capacity; production was not contacted',
  };
  const verificationDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const artifactDirectory = path.resolve(`artifacts/verification/${verificationDate}`);
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(
    path.join(artifactDirectory, 'mado-plugin-integration.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await harness.close();
  await madoServer.close();
}
