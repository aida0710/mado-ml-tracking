import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataCatalogPlugin } from '@mmt/contracts';
import { DataCatalogApiError } from '@mmt/platform';
import { createApplication } from '../src/app.js';
import type { DataCatalogClientFactory } from '../src/services/dataCatalogConnectionService.js';
import { parseSecretKey } from '../src/security/secretEncryption.js';
import { executionFixture } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import {
  DATA_CATALOG_ACCESS_TOKEN_FIXTURE,
  DATA_CATALOG_GRANT_FIXTURE,
  DATA_CATALOG_URL_FIXTURE,
  dataCatalogClientStub,
} from './dataCatalogFixtures.js';

const ENDPOINT = '/api/admin/plugins/data-catalog';
const CONNECTION_INPUT = {
  url: DATA_CATALOG_URL_FIXTURE,
  accessToken: DATA_CATALOG_ACCESS_TOKEN_FIXTURE,
};

describe.skipIf(!testDatabaseUrl)('mado S3 Data Catalogへの接続（独立PostgreSQL）', () => {
  let harness: Harness;
  beforeAll(async () => { harness = await createHarness(); });
  beforeEach(async () => { await harness.reset(); });
  afterAll(async () => { await harness?.close(); });

  function applicationWith(clientFactory: DataCatalogClientFactory, config = harness.config) {
    return createApplication({
      config, database: harness.database, stores: harness.stores,
      dataCatalogClientFactory: clientFactory,
    }).app;
  }
  async function storedRow() {
    return (await harness.database.query('SELECT * FROM data_catalog_connection')).rows[0];
  }

  it('未接続のときは接続がnullで、読むだけではmado S3 Data Catalogへ通信しない', async () => {
    const fixture = await executionFixture(harness);
    const clientFactory = vi.fn<DataCatalogClientFactory>(() => dataCatalogClientStub());
    const app = applicationWith(clientFactory);
    expect(await entity(await request(app, ENDPOINT, { cookie: fixture.administrator.cookie }), 200))
      .toEqual({ connection: null, secretStorageAvailable: true });
    expect((await request(app, `${ENDPOINT}/capacity`, { cookie: fixture.administrator.cookie })).status)
      .toBe(404);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('URLとアクセストークンを保存する1回の操作で接続を確かめ、すぐ容量を読める', async () => {
    const fixture = await executionFixture(harness);
    const clientFactory = vi.fn<DataCatalogClientFactory>(() => dataCatalogClientStub());
    const app = applicationWith(clientFactory);
    const saved = await entity<DataCatalogPlugin>(
      await request(app, ENDPOINT, {
        method: 'PUT', cookie: fixture.administrator.cookie,
        // 末尾の/は取り除いて保存する。
        body: { ...CONNECTION_INPUT, url: `${DATA_CATALOG_URL_FIXTURE}/` },
      }), 200,
    );
    expect(saved).toEqual({
      connection: {
        url: DATA_CATALOG_URL_FIXTURE,
        accessTokenGrant: DATA_CATALOG_GRANT_FIXTURE,
        checkedAt: expect.any(String),
      },
      secretStorageAvailable: true,
    });
    expect(clientFactory).toHaveBeenCalledWith(CONNECTION_INPUT);
    expect(await entity(await request(app, `${ENDPOINT}/capacity`, { cookie: fixture.administrator.cookie }), 200))
      .toEqual({ prometheus: 'storage_bytes 12\n' });
    expect(await entity(await request(app, ENDPOINT, { cookie: fixture.administrator.cookie }), 200))
      .toEqual(saved);
  });

  it('アクセストークンは暗号化して保存し、応答と監査ログには載せない', async () => {
    const fixture = await executionFixture(harness);
    const app = applicationWith(() => dataCatalogClientStub());
    const response = await request(app, ENDPOINT, {
      method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT,
    });
    expect(await response.text()).not.toContain(DATA_CATALOG_ACCESS_TOKEN_FIXTURE);
    const row = await storedRow();
    expect(row.secret_key_id).toBe(harness.config.pluginSecretKey!.id);
    expect(row.encrypted_access_token.toString('utf8')).not.toContain(DATA_CATALOG_ACCESS_TOKEN_FIXTURE);
    const audit = (await harness.database.query(
      "SELECT outcome,details FROM audit_events WHERE action='plugin.data_catalog.connect'",
    )).rows;
    expect(audit).toEqual([{
      outcome: 'success',
      details: {
        url: DATA_CATALOG_URL_FIXTURE, accessTokenName: 'ML Tracking', scopes: ['metrics:read'],
        accessTokenReplaced: true,
      },
    }]);
  });

  it('全体管理者でなければ、Projectの管理者でも読めず、接続も解除もできない', async () => {
    const fixture = await executionFixture(harness);
    const clientFactory = vi.fn<DataCatalogClientFactory>(() => dataCatalogClientStub());
    const app = applicationWith(clientFactory);
    await entity(
      await request(app, `${fixture.basePath}/members/${fixture.editor.userId}`, {
        method: 'PUT', cookie: fixture.administrator.cookie, body: { role: 'admin' },
      }), 200,
    );
    const { cookie } = fixture.editor;
    expect((await request(app, ENDPOINT, { cookie })).status).toBe(403);
    expect((await request(app, ENDPOINT, { method: 'PUT', cookie, body: CONNECTION_INPUT })).status).toBe(403);
    expect((await request(app, ENDPOINT, { method: 'DELETE', cookie })).status).toBe(403);
    expect((await request(app, `${ENDPOINT}/capacity`, { cookie })).status).toBe(403);
    expect(clientFactory).not.toHaveBeenCalled();
    expect(await storedRow()).toBeUndefined();
  });

  it('接続を確かめられなければ保存せず、直し方の分かる理由を返す', async () => {
    const fixture = await executionFixture(harness);
    const failures = [
      { status: 401, expected: { status: 422, code: 'data_catalog_access_token_rejected' } },
      { status: 403, expected: { status: 422, code: 'data_catalog_access_token_rejected' } },
      { status: 404, expected: { status: 502, code: 'data_catalog_access_token_unsupported' } },
      { status: 503, expected: { status: 502, code: 'data_catalog_request_failed' } },
    ];
    for (const { status, expected } of failures) {
      const app = applicationWith(() => dataCatalogClientStub({
        accessTokenGrant: async () => { throw new DataCatalogApiError(status); },
      }));
      const response = await request(app, ENDPOINT, {
        method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT,
      });
      expect(response.status).toBe(expected.status);
      const body = await response.text();
      expect(JSON.parse(body)).toMatchObject({ code: expected.code });
      expect(body).not.toContain(DATA_CATALOG_ACCESS_TOKEN_FIXTURE);
    }
    expect(await storedRow()).toBeUndefined();
  });

  it('容量を読める権限があるのに容量を読めなければ保存しない', async () => {
    const fixture = await executionFixture(harness);
    const app = applicationWith(() => dataCatalogClientStub({
      capacityMetrics: async () => { throw new DataCatalogApiError(500); },
    }));
    expect((await request(app, ENDPOINT, {
      method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT,
    })).status).toBe(502);
    expect(await storedRow()).toBeUndefined();
  });

  it('容量を読めないトークンでも接続は保存するが、容量は問い合わせずに断る', async () => {
    const fixture = await executionFixture(harness);
    const capacityMetrics = vi.fn(async () => 'storage_bytes 12\n');
    const app = applicationWith(() => dataCatalogClientStub({
      accessTokenGrant: async () => ({ ...DATA_CATALOG_GRANT_FIXTURE, scopes: [] }),
      capacityMetrics,
    }));
    const saved = await entity<DataCatalogPlugin>(
      await request(app, ENDPOINT, { method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT }),
      200,
    );
    expect(saved.connection?.accessTokenGrant.scopes).toEqual([]);
    const capacity = await request(app, `${ENDPOINT}/capacity`, { cookie: fixture.administrator.cookie });
    expect(capacity.status).toBe(422);
    expect(await capacity.json()).toMatchObject({ code: 'data_catalog_capacity_not_permitted' });
    expect(capacityMetrics).not.toHaveBeenCalled();
  });

  it('アクセストークンを省くと同じURLの保存済みのトークンで確かめ直し、権限の変更を読み直す', async () => {
    const fixture = await executionFixture(harness);
    let grant = { ...DATA_CATALOG_GRANT_FIXTURE, scopes: [] as string[] };
    const clientFactory = vi.fn<DataCatalogClientFactory>(() =>
      dataCatalogClientStub({ accessTokenGrant: async () => grant }));
    const app = applicationWith(clientFactory);
    await entity(
      await request(app, ENDPOINT, { method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT }),
      200,
    );
    grant = DATA_CATALOG_GRANT_FIXTURE;
    const rechecked = await entity<DataCatalogPlugin>(
      await request(app, ENDPOINT, {
        method: 'PUT', cookie: fixture.administrator.cookie, body: { url: DATA_CATALOG_URL_FIXTURE },
      }), 200,
    );
    expect(rechecked.connection?.accessTokenGrant.scopes).toEqual(['metrics:read']);
    expect(clientFactory).toHaveBeenLastCalledWith(CONNECTION_INPUT);
  });

  it('保存済みのトークンは別のURLへ送らず、URLを変えるときはトークンの入力を求める', async () => {
    const fixture = await executionFixture(harness);
    const clientFactory = vi.fn<DataCatalogClientFactory>(() => dataCatalogClientStub());
    const app = applicationWith(clientFactory);
    const first = await request(app, ENDPOINT, {
      method: 'PUT', cookie: fixture.administrator.cookie, body: { url: DATA_CATALOG_URL_FIXTURE },
    });
    expect(first.status).toBe(422);
    expect(await first.json()).toMatchObject({ code: 'data_catalog_access_token_required' });
    await entity(
      await request(app, ENDPOINT, { method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT }),
      200,
    );
    clientFactory.mockClear();
    const moved = await request(app, ENDPOINT, {
      method: 'PUT', cookie: fixture.administrator.cookie, body: { url: 'https://other.example.test' },
    });
    expect(moved.status).toBe(422);
    expect(clientFactory).not.toHaveBeenCalled();
    expect((await storedRow()).url).toBe(DATA_CATALOG_URL_FIXTURE);
  });

  it('認証情報・query・fragmentを含むURLは受け付けず、入力をエラーに写さない', async () => {
    const fixture = await executionFixture(harness);
    const app = applicationWith(() => dataCatalogClientStub());
    for (const url of [
      'https://user:fixture-password@catalog.example.test', 'https://catalog.example.test/?token=fixture-password',
      'ftp://catalog.example.test', 'catalog.example.test',
    ]) {
      const response = await request(app, ENDPOINT, {
        method: 'PUT', cookie: fixture.administrator.cookie, body: { ...CONNECTION_INPUT, url },
      });
      expect(response.status).toBe(422);
      expect(await response.text()).not.toContain('fixture-password');
    }
  });

  it('保存用の暗号鍵が無ければ接続を保存できず、鍵を入れ替えたあとはトークンの再入力で復旧する', async () => {
    const fixture = await executionFixture(harness);
    const withoutKey = applicationWith(() => dataCatalogClientStub(), { ...harness.config, pluginSecretKey: null });
    expect(await entity(await request(withoutKey, ENDPOINT, { cookie: fixture.administrator.cookie }), 200))
      .toEqual({ connection: null, secretStorageAvailable: false });
    const rejected = await request(withoutKey, ENDPOINT, {
      method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT,
    });
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toMatchObject({ code: 'data_catalog_secret_key_unavailable' });

    const app = applicationWith(() => dataCatalogClientStub());
    await entity(
      await request(app, ENDPOINT, { method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT }),
      200,
    );
    const rotatedKey = parseSecretKey(Buffer.alloc(32, 2).toString('base64'));
    const rotated = applicationWith(() => dataCatalogClientStub(), { ...harness.config, pluginSecretKey: rotatedKey });
    const unreadable = await request(rotated, `${ENDPOINT}/capacity`, { cookie: fixture.administrator.cookie });
    expect(unreadable.status).toBe(503);
    expect(await unreadable.json()).toMatchObject({ code: 'data_catalog_secret_decryption_failed' });
    await entity(
      await request(rotated, ENDPOINT, { method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT }),
      200,
    );
    expect((await storedRow()).secret_key_id).toBe(rotatedKey.id);
    expect((await request(rotated, `${ENDPOINT}/capacity`, { cookie: fixture.administrator.cookie })).status).toBe(200);
  });

  it('接続を解除すると保存したトークンごと消え、解除を監査ログに残す', async () => {
    const fixture = await executionFixture(harness);
    const app = applicationWith(() => dataCatalogClientStub());
    await entity(
      await request(app, ENDPOINT, { method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT }),
      200,
    );
    expect((await request(app, ENDPOINT, { method: 'DELETE', cookie: fixture.administrator.cookie })).status)
      .toBe(204);
    expect(await storedRow()).toBeUndefined();
    expect(await entity(await request(app, ENDPOINT, { cookie: fixture.administrator.cookie }), 200))
      .toMatchObject({ connection: null });
    expect((await request(app, ENDPOINT, { method: 'DELETE', cookie: fixture.administrator.cookie })).status)
      .toBe(404);
    expect((await harness.database.query(
      "SELECT outcome,details FROM audit_events WHERE action='plugin.data_catalog.disconnect'",
    )).rows).toEqual([{ outcome: 'success', details: { url: DATA_CATALOG_URL_FIXTURE } }]);
  });
});
