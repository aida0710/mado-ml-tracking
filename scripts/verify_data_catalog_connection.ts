/**
 * 組み込みのmado S3 Data Catalogのクライアントと本物のhostを、fixtureの認証と容量の値を付けた
 * mado S3 Data CatalogのHTTPの経路につなぐ。
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataCatalogPlugin } from '@mmt/contracts';
import { createApplication } from '../apps/api/src/app.js';
import { createHarness, entity, login, request } from '../apps/api/test/harness.js';
import {
  DATA_CATALOG_VERIFICATION_BUCKET_BYTES,
  startDataCatalogVerificationServer,
} from './fixtures/dataCatalogVerificationServer.js';

const ENDPOINT = '/api/admin/plugins/data-catalog';
const dataCatalogServer = await startDataCatalogVerificationServer();
const harness = await createHarness();
const host = createApplication({
  config: harness.config,
  database: harness.database,
  stores: harness.stores,
});
try {
  const administrator = await login(harness);
  const connect = (accessToken: string) =>
    request(host.app, ENDPOINT, {
      method: 'PUT',
      cookie: administrator.cookie,
      body: { url: dataCatalogServer.url, accessToken },
    });

  // mado S3 Data Catalogが知らないtokenでは、接続を確かめられないので保存しない。
  const rejected = await connect('unknown-fixture-token');
  assert.equal(rejected.status, 422);
  const rejectedBody = await rejected.text();
  assert.equal(JSON.parse(rejectedBody).code, 'data_catalog_access_token_rejected');
  assert(!rejectedBody.includes('unknown-fixture-token'));
  const unconnected = await entity<DataCatalogPlugin>(
    await request(host.app, ENDPOINT, { cookie: administrator.cookie }),
    200,
  );
  assert.equal(unconnected.connection, null);

  const connected = await entity<DataCatalogPlugin>(
    await connect(dataCatalogServer.accessToken),
    200,
  );
  // 保存するのは名前・scope・有効期限だけ。mado S3 Data Catalogが返すtokenのIDは残さない。
  assert.deepEqual(connected.connection?.accessTokenGrant, {
    name: dataCatalogServer.tokenName,
    scopes: ['metrics:read'],
    expiresAt: null,
  });
  assert.equal(connected.connection?.url, dataCatalogServer.url);

  // 接続できた時点で、有効にする操作を挟まずに容量を読める。
  const capacity = await entity<{ prometheus: string }>(
    await request(host.app, `${ENDPOINT}/capacity`, { cookie: administrator.cookie }),
    200,
  );
  assert(capacity.prometheus.includes('mado_storage_bucket_bytes'));
  assert(capacity.prometheus.includes(DATA_CATALOG_VERIFICATION_BUCKET_BYTES));

  // tokenを送らずに、保存済みのtokenで確かめ直せる。
  const rechecked = await entity<DataCatalogPlugin>(
    await request(host.app, ENDPOINT, {
      method: 'PUT',
      cookie: administrator.cookie,
      body: { url: dataCatalogServer.url },
    }),
    200,
  );
  assert.deepEqual(rechecked.connection?.accessTokenGrant, connected.connection?.accessTokenGrant);

  const summary = {
    checks: [
      'a token unknown to mado S3 Data Catalog is rejected without being saved or leaked',
      "access token name, scopes and expiration read from /api/mado/access-token under the web URL",
      'token ID returned by mado S3 Data Catalog is not stored',
      'capacity read through the built-in client and host API right after connecting',
      'the stored token checks the connection again',
    ],
    dataCatalog:
      'real mado S3 Data Catalog routes with fixture authentication and capacity; production was not contacted',
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
    path.join(artifactDirectory, 'data-catalog-connection.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await harness.close();
  await dataCatalogServer.close();
}
