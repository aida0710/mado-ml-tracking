import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dataset, DatasetVersion, PluginConnection } from '@mmt/contracts';
import { createApplication } from '../src/app.js';
import type { PluginClientFactory } from '../src/services/pluginService.js';
import { parseSecretKey } from '../src/security/secretEncryption.js';
import { executionFixture, projectFixture, referenceDigest } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import {
  MADO_ACCESS_TOKEN_GRANT_FIXTURE, MADO_CONFIG_FIXTURE, MADO_CREDENTIALS_FIXTURE, madoClientStub, madoPluginInput,
} from './pluginFixtures.js';

// 以前の版が取り込んだバージョンの、mado S3 Data Catalogでの識別子。
const MADO_VERSION_ID_FIXTURE = 'e5aab0f8-acdc-40a4-8177-107b7ca5dba7';

describe.skipIf(!testDatabaseUrl)('内蔵Madoの設定・秘匿と接続確認（独立PostgreSQL）', () => {
  let harness: Harness;
  beforeAll(async () => { harness = await createHarness(); });
  beforeEach(async () => { await harness.reset(); });
  afterAll(async () => { await harness?.close(); });

  it('設定と保存用キーなしで起動し、接続の一覧のGETは接続を作成も通信もしない', async () => {
    const unconfiguredHarness = await createHarness({ environment: { MMT_PLUGIN_SECRET_KEY: undefined } });
    try {
      const fixture = await projectFixture(unconfiguredHarness);
      const clientFactory = vi.fn(() => madoClientStub());
      const application = createApplication({
        config: unconfiguredHarness.config, database: unconfiguredHarness.database,
        stores: unconfiguredHarness.stores, pluginClientFactory: clientFactory,
      });
      expect(unconfiguredHarness.config.pluginSecretKey).toBeNull();
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(await entity(
          await request(application.app, `${fixture.basePath}/plugins`, { cookie: fixture.administrator.cookie }), 200,
        )).toEqual({ items: [] });
      }
      expect(clientFactory).not.toHaveBeenCalled();
      expect((await unconfiguredHarness.database.query('SELECT count(*)::int AS count FROM plugin_connections')).rows[0].count).toBe(0);
    } finally {
      await unconfiguredHarness.close();
    }
  });

  it('保存用キーなしでも初期無効の設定を保存でき、認証キー保存は失敗して値を返さない', async () => {
    const fixture = await projectFixture(harness);
    const application = createApplication({
      config: { ...harness.config, pluginSecretKey: null },
      database: harness.database, stores: harness.stores,
    });
    const saved = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST', cookie: fixture.administrator.cookie,
        body: { kind: 'mado', config: MADO_CONFIG_FIXTURE },
      }),
    );
    expect(saved).toMatchObject({ kind: 'mado', enabled: false, tokenConfigured: false, secretStorageAvailable: false });
    const rejected = await request(application.app, `${fixture.basePath}/plugins/${saved.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { credentials: MADO_CREDENTIALS_FIXTURE, expectedRevision: saved.configRevision },
    });
    expect(rejected.status).toBe(503);
    const failure = await rejected.text();
    expect(failure).not.toContain(MADO_CREDENTIALS_FIXTURE.accessToken!);
    expect((await request(application.app, `${fixture.basePath}/plugins/${saved.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie, body: { enabled: true },
    })).status).toBe(422);
    expect((await harness.database.query('SELECT encrypted_credentials,enabled FROM plugin_connections WHERE id=$1', [saved.id])).rows[0])
      .toEqual({ encrypted_credentials: null, enabled: false });
  });

  it('認証キーを暗号化し、Project admin以外には接続の設定を返さない', async () => {
    const fixture = await projectFixture(harness);
    const input = madoPluginInput({ enabled: false });
    const connection = await entity<PluginConnection>(
      await request(harness.app, `${fixture.basePath}/plugins`, {
        method: 'POST', cookie: fixture.administrator.cookie, body: input,
      }),
    );
    expect(connection.credentialsConfigured).toEqual({ accessToken: true });
    const row = (await harness.database.query('SELECT encrypted_credentials,secret_key_id FROM plugin_connections WHERE id=$1', [connection.id])).rows[0];
    expect(Buffer.isBuffer(row.encrypted_credentials)).toBe(true);
    expect(row.secret_key_id).toBe(harness.config.pluginSecretKey!.id);
    expect(row.encrypted_credentials.includes(Buffer.from(input.credentials.accessToken!))).toBe(false);
    expect(JSON.stringify(connection)).not.toContain(input.credentials.accessToken);
    for (const identity of [fixture.viewer, fixture.editor, fixture.outsider])
      expect((await request(harness.app, `${fixture.basePath}/plugins`, { cookie: identity.cookie })).status).toBe(403);
  });

  it('キーを別接続へコピーしても復号できず、Madoへ送信しない', async () => {
    const fixture = await projectFixture(harness);
    const connections: PluginConnection[] = [];
    for (const name of ['Original', 'Copied'])
      connections.push(await entity<PluginConnection>(
        await request(harness.app, `${fixture.basePath}/plugins`, {
          method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput({ name, enabled: false }),
        }),
      ));
    await harness.database.query(`UPDATE plugin_connections SET encrypted_credentials=original.encrypted_credentials,
      secret_key_id=original.secret_key_id FROM plugin_connections original
      WHERE original.id=$1 AND plugin_connections.id=$2`, [connections[0]!.id, connections[1]!.id]);
    const clientFactory = vi.fn(() => madoClientStub());
    const application = createApplication({ config: harness.config, database: harness.database, stores: harness.stores, pluginClientFactory: clientFactory });
    const rejected = await request(application.app, `${fixture.basePath}/plugins/${connections[1]!.id}/check`, {
      method: 'POST', cookie: fixture.administrator.cookie,
    });
    expect(rejected.status).toBe(503);
    expect(await rejected.text()).not.toContain(MADO_CREDENTIALS_FIXTURE.accessToken!);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('無効なMadoでも接続確認でトークンの許可範囲を保存し、トークンを入れ替えると確認結果を消す', async () => {
    const fixture = await projectFixture(harness);
    const checkConnection = vi.fn(madoClientStub().checkConnection);
    const clientFactory = vi.fn<PluginClientFactory>(() => madoClientStub({ checkConnection }));
    const application = createApplication({ config: harness.config, database: harness.database, stores: harness.stores, pluginClientFactory: clientFactory });
    const connection = await entity<PluginConnection>(await request(application.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput({ enabled: false }),
    }));
    expect(connection).toMatchObject({ credentialsConfigured: { accessToken: true }, accessTokenGrant: null, manifest: null });
    const checked = await entity<PluginConnection>(await request(application.app, `${fixture.basePath}/plugins/${connection.id}/check`, {
      method: 'POST', cookie: fixture.administrator.cookie,
    }), 200);
    expect(checked).toMatchObject({
      id: connection.id, enabled: false, configRevision: connection.configRevision,
      accessTokenGrant: MADO_ACCESS_TOKEN_GRANT_FIXTURE,
      manifest: { capabilities: [] },
    });
    expect(checkConnection).toHaveBeenCalledOnce();
    expect(clientFactory).toHaveBeenCalledWith(expect.objectContaining({ credentials: MADO_CREDENTIALS_FIXTURE }));
    // tokenを保存し直したら確認し直す必要がある。保存済みのgrantは置き換えた前のtokenのもの。
    const replaced = await entity<PluginConnection>(await request(application.app, `${fixture.basePath}/plugins/${connection.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { credentials: { accessToken: 'replaced-fixture-token' }, expectedRevision: checked.configRevision },
    }), 200);
    expect(replaced).toMatchObject({ accessTokenGrant: null, manifest: null });
  });

  it('容量の読み取りを許可していないトークンでは容量を取得せず、許可を確認した後だけ取得する', async () => {
    const fixture = await projectFixture(harness);
    let grant = MADO_ACCESS_TOKEN_GRANT_FIXTURE;
    const metrics = vi.fn(async () => ({ prometheus: 'mado_storage_bucket_bytes 1\n' }));
    const application = createApplication({
      config: harness.config, database: harness.database, stores: harness.stores,
      pluginClientFactory: () => madoClientStub({ grant, metrics }),
    });
    const connection = await entity<PluginConnection>(await request(application.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput(),
    }));
    const metricsPath = `${fixture.basePath}/plugins/${connection.id}/metrics`;
    const check = () => request(application.app, `${fixture.basePath}/plugins/${connection.id}/check`, {
      method: 'POST', cookie: fixture.administrator.cookie,
    });
    expect((await request(application.app, metricsPath, { cookie: fixture.administrator.cookie })).status).toBe(422);
    await entity(await check(), 200);
    expect((await request(application.app, metricsPath, { cookie: fixture.administrator.cookie })).status).toBe(422);
    expect(metrics).not.toHaveBeenCalled();
    grant = { ...MADO_ACCESS_TOKEN_GRANT_FIXTURE, scopes: [...MADO_ACCESS_TOKEN_GRANT_FIXTURE.scopes, 'metrics:read'] };
    expect(await entity<PluginConnection>(await check(), 200)).toMatchObject({
      manifest: { capabilities: ['storage:metrics'] },
    });
    expect(await entity(await request(application.app, metricsPath, { cookie: fixture.administrator.cookie }), 200))
      .toEqual({ prometheus: 'mado_storage_bucket_bytes 1\n' });
  });

  it('保存用の暗号鍵を失ってもアクセストークンの再入力で復旧し、入力しなければ保存済みの値を保つ', async () => {
    const fixture = await projectFixture(harness);
    const saved = await entity<PluginConnection>(await request(harness.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput({ enabled: false }),
    }));
    const rotatedKey = parseSecretKey(Buffer.alloc(32, 2).toString('base64'));
    const clientFactory = vi.fn<PluginClientFactory>(() => madoClientStub());
    const application = createApplication({
      config: { ...harness.config, pluginSecretKey: rotatedKey }, database: harness.database,
      stores: harness.stores, pluginClientFactory: clientFactory,
    });
    const endpoint = `${fixture.basePath}/plugins/${saved.id}`;
    expect((await request(application.app, endpoint + '/check', {
      method: 'POST', cookie: fixture.administrator.cookie,
    })).status).toBe(503);
    const renamed = await entity<PluginConnection>(await request(application.app, endpoint, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { name: 'Renamed', credentials: {}, expectedRevision: saved.configRevision },
    }), 200);
    expect(renamed.credentialsConfigured).toEqual({ accessToken: true });
    expect((await harness.database.query('SELECT secret_key_id FROM plugin_connections WHERE id=$1', [saved.id])).rows[0].secret_key_id)
      .toBe(harness.config.pluginSecretKey!.id);
    const restored = await entity<PluginConnection>(await request(application.app, endpoint, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { credentials: { accessToken: 'new-fixture-token' }, expectedRevision: renamed.configRevision },
    }), 200);
    expect(restored).toMatchObject({ id: saved.id, tokenConfigured: true, credentialsConfigured: { accessToken: true } });
    expect((await harness.database.query('SELECT secret_key_id FROM plugin_connections WHERE id=$1', [saved.id])).rows[0].secret_key_id).toBe(rotatedKey.id);
    await entity(await request(application.app, endpoint + '/check', { method: 'POST', cookie: fixture.administrator.cookie }), 200);
    expect(clientFactory).toHaveBeenCalledWith(expect.objectContaining({ credentials: { accessToken: 'new-fixture-token' } }));
  });

  it('アクセストークンが未設定の接続は、接続確認を503で断ってMadoへ通信しない', async () => {
    const fixture = await projectFixture(harness);
    const clientFactory = vi.fn<PluginClientFactory>(() => madoClientStub());
    const application = createApplication({ config: harness.config, database: harness.database, stores: harness.stores, pluginClientFactory: clientFactory });
    const unconfigured = await entity<PluginConnection>(await request(application.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie,
      body: madoPluginInput({ enabled: false, credentials: {} }),
    }));
    expect(unconfigured.tokenConfigured).toBe(false);
    expect((await request(application.app, `${fixture.basePath}/plugins/${unconfigured.id}/check`, {
      method: 'POST', cookie: fixture.administrator.cookie,
    })).status).toBe(503);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('データセットバージョンが外部参照で指す接続は、名前は変えられるが接続先は変えられない', async () => {
    const fixture = await projectFixture(harness);
    const connection = await entity<PluginConnection>(await request(harness.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput(),
    }));
    const dataset = await entity<Dataset>(await request(harness.app, `${fixture.basePath}/datasets`, {
      method: 'POST', cookie: fixture.editor.cookie, body: { namespace: 'remote', name: 'Corpus' },
    }));
    // 以前の版がmado S3 Data Catalogから取り込んだバージョンと同じ形。接続のUUIDは大文字でも同じ接続を指す。
    const externalRef = {
      pluginId: connection.id.toUpperCase(), externalId: MADO_VERSION_ID_FIXTURE,
      namespace: 'remote', name: 'Corpus', version: 'v1',
    };
    const imported = await entity<DatasetVersion>(await request(harness.app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
      method: 'POST', cookie: fixture.editor.cookie,
      body: { version: 'v1', uri: 's3://fixture/corpus', digest: referenceDigest('external-reference'), externalRef },
    }));
    expect(imported.externalRef).toEqual(externalRef);
    const endpoint = `${fixture.basePath}/plugins/${connection.id}`;
    for (const changed of [{ apiUrl: 'https://different-mado-api.example.test' }, { webUrl: 'https://different-mado.example.test' }])
      expect((await request(harness.app, endpoint, {
        method: 'PATCH', cookie: fixture.administrator.cookie,
        body: { config: { ...MADO_CONFIG_FIXTURE, ...changed }, expectedRevision: connection.configRevision },
      })).status).toBe(409);
    const renamed = await entity<PluginConnection>(await request(harness.app, endpoint, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { name: 'Renamed', config: MADO_CONFIG_FIXTURE, expectedRevision: connection.configRevision },
    }), 200);
    expect(renamed).toMatchObject({ name: 'Renamed', config: MADO_CONFIG_FIXTURE });
  });

  it('Runを終えても連携へ送るイベントを積まない', async () => {
    const fixture = await executionFixture(harness);
    await entity(await request(harness.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput(),
    }));
    const run = await fixture.newRun();
    for (const status of ['running', 'finished'])
      await entity(await request(harness.app, `${fixture.basePath}/runs/${run.id}`, {
        method: 'PATCH', cookie: fixture.editor.cookie, body: { status },
      }), 200);
    expect((await harness.database.query('SELECT id FROM plugin_outbox')).rows).toEqual([]);
  });

  it('DataLineageのための設定項目と、取り込み・検索・送信状況・再送のAPIは受け付けない', async () => {
    const fixture = await projectFixture(harness);
    expect((await request(harness.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie,
      body: madoPluginInput({ config: { lineageUrl: 'https://mado-lineage.example.test' } as object }),
    })).status).toBe(422);
    const connection = await entity<PluginConnection>(await request(harness.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput(),
    }));
    for (const [method, path] of [
      ['GET', 'availability'],
      ['GET', `${connection.id}/outbox`],
      ['POST', `${connection.id}/datasets/search`],
      ['POST', `${connection.id}/datasets/import`],
      ['POST', `${connection.id}/events/retry`],
    ] as const)
      expect((await request(harness.app, `${fixture.basePath}/plugins/${path}`, {
        method, cookie: fixture.administrator.cookie, ...(method === 'POST' ? { body: {} } : {}),
      })).status).toBe(404);
  });
});
