import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dataset, DatasetVersion, PluginAvailability, PluginConnection, Run } from '@mmt/contracts';
import { createApplication } from '../src/app.js';
import type { PluginClientFactory } from '../src/services/pluginService.js';
import { parseSecretKey } from '../src/security/secretEncryption.js';
import { executionFixture, projectFixture, referenceDigest } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import { MADO_CONFIG_FIXTURE, MADO_CREDENTIALS_FIXTURE, madoClientStub, madoPluginInput } from './pluginFixtures.js';

describe.skipIf(!testDatabaseUrl)('内蔵Madoの設定・秘匿と固定配送（独立PostgreSQL）', () => {
  let harness: Harness;
  beforeAll(async () => { harness = await createHarness(); });
  beforeEach(async () => { await harness.reset(); });
  afterAll(async () => { await harness?.close(); });

  it('設定と保存用キーなしで起動し、Madoの表示用GETは接続を作成も通信もしない', async () => {
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
        const available = await entity<{ items: PluginAvailability[] }>(
          await request(application.app, `${fixture.basePath}/plugins/availability`, { cookie: fixture.viewer.cookie }), 200,
        );
        expect(available.items).toEqual([{
          kind: 'mado', id: null, enabled: false, configured: false,
          configRevision: 0, webUrl: null, canImport: false,
        }]);
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
    expect(failure).not.toContain(MADO_CREDENTIALS_FIXTURE.readToken!);
    expect(failure).not.toContain(MADO_CREDENTIALS_FIXTURE.lineageToken!);
    expect((await request(application.app, `${fixture.basePath}/plugins/${saved.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie, body: { enabled: true },
    })).status).toBe(422);
    expect((await harness.database.query('SELECT encrypted_credentials,enabled FROM plugin_connections WHERE id=$1', [saved.id])).rows[0])
      .toEqual({ encrypted_credentials: null, enabled: false });
  });

  it('認証キーを暗号化し、閲覧者向けの状態に送信先・環境変数名・キーを含めない', async () => {
    const fixture = await projectFixture(harness);
    const input = madoPluginInput({ enabled: false });
    const connection = await entity<PluginConnection>(
      await request(harness.app, `${fixture.basePath}/plugins`, {
        method: 'POST', cookie: fixture.administrator.cookie, body: input,
      }),
    );
    expect(connection.credentialsConfigured).toEqual({ readToken: true, lineageToken: true, metricsToken: false });
    const row = (await harness.database.query('SELECT encrypted_credentials,secret_key_id FROM plugin_connections WHERE id=$1', [connection.id])).rows[0];
    expect(Buffer.isBuffer(row.encrypted_credentials)).toBe(true);
    expect(row.secret_key_id).toBe(harness.config.pluginSecretKey!.id);
    expect(row.encrypted_credentials.includes(Buffer.from(input.credentials.readToken!))).toBe(false);
    expect(JSON.stringify(connection)).not.toContain(input.credentials.readToken);
    const availabilityPath = `${fixture.basePath}/plugins/availability`;
    for (const identity of [fixture.viewer, fixture.editor]) {
      expect((await request(harness.app, `${fixture.basePath}/plugins`, { cookie: identity.cookie })).status).toBe(403);
      const reply = await entity<{ items: PluginAvailability[] }>(
        await request(harness.app, availabilityPath, { cookie: identity.cookie }), 200,
      );
      expect(reply.items).toEqual([{
        kind: 'mado', id: connection.id, enabled: false, configured: true,
        configRevision: connection.configRevision, webUrl: input.config.webUrl, canImport: false,
      }]);
      const publicReply = JSON.stringify(reply);
      for (const excluded of ['apiUrl', 'lineageUrl', 'tokenEnv', 'credentials', 'encrypted', input.credentials.readToken!, input.credentials.lineageToken!])
        expect(publicReply).not.toContain(excluded);
    }
    expect((await request(harness.app, availabilityPath, { cookie: fixture.outsider.cookie })).status).toBe(403);
    await entity(await request(harness.app, `${fixture.basePath}/plugins/${connection.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie, body: { enabled: true },
    }), 200);
    await entity(await request(harness.app, `${fixture.basePath}/members/${fixture.editor.userId}`, {
      method: 'PUT', cookie: fixture.administrator.cookie, body: { role: 'admin' },
    }), 200);
    const availableToAdmin = await entity<{ items: PluginAvailability[] }>(
      await request(harness.app, availabilityPath, { cookie: fixture.editor.cookie }), 200,
    );
    expect(availableToAdmin.items[0]).toMatchObject({ enabled: true, canImport: true });
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
    expect(await rejected.text()).not.toContain(MADO_CREDENTIALS_FIXTURE.readToken!);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('無効なMadoは参照キーだけで接続確認でき、送信も送信待ちの作成も行わない', async () => {
    const fixture = await projectFixture(harness);
    const sendPayload = vi.fn(async (_payload: string) => undefined);
    const manifest = vi.fn(madoClientStub().manifest);
    const clientFactory = vi.fn<PluginClientFactory>(() => madoClientStub({ manifest, sendPayload }));
    const application = createApplication({ config: harness.config, database: harness.database, stores: harness.stores, pluginClientFactory: clientFactory });
    const connection = await entity<PluginConnection>(await request(application.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie,
      body: madoPluginInput({ enabled: false, credentials: { readToken: MADO_CREDENTIALS_FIXTURE.readToken } }),
    }));
    expect(connection.credentialsConfigured).toEqual({ readToken: true, lineageToken: false, metricsToken: false });
    await entity(await request(application.app, `${fixture.basePath}/plugins/${connection.id}/check`, {
      method: 'POST', cookie: fixture.administrator.cookie,
    }), 200);
    expect(manifest).toHaveBeenCalledOnce();
    expect(clientFactory).toHaveBeenCalledWith(expect.objectContaining({ credentials: { readToken: MADO_CREDENTIALS_FIXTURE.readToken } }));
    expect(sendPayload).not.toHaveBeenCalled();
    expect((await harness.database.query('SELECT id FROM plugin_outbox')).rows).toHaveLength(0);
    expect((await request(application.app, `${fixture.basePath}/plugins/${connection.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie, body: { enabled: true },
    })).status).toBe(422);
  });

  it('保存用の暗号鍵を失っても全キーの再入力で復旧し、省略したキーの誤った消去を防ぐ', async () => {
    const fixture = await projectFixture(harness);
    const saved = await entity<PluginConnection>(await request(harness.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie,
      body: madoPluginInput({ enabled: false, credentials: { ...MADO_CREDENTIALS_FIXTURE, metricsToken: 'old-fixture-metrics' } }),
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
    for (const credentials of [
      { readToken: 'new-fixture-read' },
      { readToken: 'new-fixture-read', lineageToken: 'new-fixture-write' },
    ])
      expect((await request(application.app, endpoint, {
        method: 'PATCH', cookie: fixture.administrator.cookie,
        body: { credentials, expectedRevision: saved.configRevision },
      })).status).toBe(503);
    expect((await harness.database.query('SELECT secret_key_id,config_revision FROM plugin_connections WHERE id=$1', [saved.id])).rows[0])
      .toEqual({ secret_key_id: harness.config.pluginSecretKey!.id, config_revision: saved.configRevision });
    const restored = await entity<PluginConnection>(await request(application.app, endpoint, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { credentials: { readToken: 'new-fixture-read', lineageToken: 'new-fixture-write', metricsToken: null }, expectedRevision: saved.configRevision },
    }), 200);
    expect(restored).toMatchObject({ id: saved.id, tokenConfigured: true, credentialsConfigured: { readToken: true, lineageToken: true, metricsToken: false } });
    expect((await harness.database.query('SELECT secret_key_id FROM plugin_connections WHERE id=$1', [saved.id])).rows[0].secret_key_id).toBe(rotatedKey.id);
    await entity(await request(application.app, endpoint + '/check', { method: 'POST', cookie: fixture.administrator.cookie }), 200);
    expect(clientFactory).toHaveBeenCalledWith(expect.objectContaining({ credentials: { readToken: 'new-fixture-read', lineageToken: 'new-fixture-write' } }));
  });

  it('Namespace外の固定バージョンと古い設定での取り込みを拒否し、既存Datasetを作らない', async () => {
    const fixture = await projectFixture(harness);
    const externalId = randomUUID();
    const datasetVersion = vi.fn(async () => ({
      externalId, namespace: 'forbidden', name: 'Corpus', version: 'v1',
      uri: 's3://fixture/forbidden', digest: referenceDigest('forbidden'), schema: {}, metadata: {},
    }));
    const application = createApplication({ config: harness.config, database: harness.database, stores: harness.stores, pluginClientFactory: () => madoClientStub({ datasetVersion }) });
    const connection = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput(),
      }),
    );
    const endpoint = `${fixture.basePath}/plugins/${connection.id}/datasets/import`;
    expect((await request(application.app, endpoint, {
      method: 'POST', cookie: fixture.administrator.cookie, body: { externalId, expectedRevision: connection.configRevision },
    })).status).toBe(422);
    expect((await harness.database.query('SELECT id FROM datasets')).rows).toHaveLength(0);
    await entity(await request(application.app, `${fixture.basePath}/plugins/${connection.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { credentials: { readToken: 'rotated-fixture' }, expectedRevision: connection.configRevision },
    }), 200);
    datasetVersion.mockClear();
    expect((await request(application.app, endpoint, {
      method: 'POST', cookie: fixture.administrator.cookie, body: { externalId, expectedRevision: connection.configRevision },
    })).status).toBe(409);
    expect(datasetVersion).not.toHaveBeenCalled();
    expect((await request(application.app, endpoint, {
      method: 'POST', cookie: fixture.administrator.cookie,
      body: { dataset: { externalId, namespace: 'remote', name: 'Spoof', version: 'v1', uri: 's3://fixture/spoof', digest: referenceDigest('spoof'), schema: {}, metadata: {} } },
    })).status).toBe(422);
  });

  it('既存の相対URIを持つDatasetがあってもRun開始と完了を記録し、versionとhashを配送する', async () => {
    const fixture = await executionFixture(harness);
    const sendPayload = vi.fn(async (_payload: string) => undefined);
    const application = createApplication({
      config: harness.config, database: harness.database, stores: harness.stores,
      pluginClientFactory: () => madoClientStub({ sendPayload }),
    });
    await entity(await request(application.app, `${fixture.basePath}/plugins`, {
      method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput(),
    }));
    const inputDigest = referenceDigest('relative-input');
    const inputDataset = await entity<Dataset>(await request(application.app, `${fixture.basePath}/datasets`, {
      method: 'POST', cookie: fixture.editor.cookie, body: { namespace: 'local', name: 'Relative input' },
    }));
    const inputVersion = await entity<DatasetVersion>(await request(application.app, `${fixture.basePath}/datasets/${inputDataset.id}/versions`, {
      method: 'POST', cookie: fixture.editor.cookie,
      body: { version: 'v1', uri: '/mnt/corpus', digest: inputDigest },
    }));
    const run = await entity<Run>(await request(application.app, `${fixture.basePath}/runs`, {
      method: 'POST', cookie: fixture.editor.cookie,
      body: { experimentId: fixture.experiment.id, name: 'Relative URI Run', kind: 'inference', modelVersionId: fixture.modelVersion.id, inputDatasetVersionIds: [inputVersion.id] },
    }));
    const runPath = `${fixture.basePath}/runs/${run.id}`;
    await entity(await request(application.app, runPath, {
      method: 'PATCH', cookie: fixture.editor.cookie, body: { status: 'running' },
    }), 200);
    const outputDigest = referenceDigest('relative-output');
    const outputDataset = await entity<Dataset>(await request(application.app, `${fixture.basePath}/datasets`, {
      method: 'POST', cookie: fixture.editor.cookie, body: { namespace: 'local', name: 'Relative output' },
    }));
    await entity(await request(application.app, `${fixture.basePath}/datasets/${outputDataset.id}/versions`, {
      method: 'POST', cookie: fixture.editor.cookie,
      body: { version: 'v2', uri: '/mnt/predictions', digest: outputDigest, sourceRunId: run.id },
    }));
    const finished = await entity<Run>(await request(application.app, runPath, {
      method: 'PATCH', cookie: fixture.editor.cookie, body: { status: 'finished' },
    }), 200);
    expect(finished.status).toBe('finished');
    expect(await application.outbox.dispatchBatch()).toBe(2);
    const payloads = sendPayload.mock.calls.map(([payload]) => JSON.parse(payload));
    expect(payloads.map((payload) => payload.eventType).sort()).toEqual(['COMPLETE', 'START']);
    const completed = payloads.find((payload) => payload.eventType === 'COMPLETE');
    expect(completed.inputs[0].facets).toEqual({
      version: { datasetVersion: 'v1' }, datasetRegistry: { contentHash: inputDigest },
    });
    expect(completed.outputs[0].facets).toEqual({
      version: { datasetVersion: 'v2' }, datasetRegistry: { contentHash: outputDigest },
    });
    expect(payloads.every((payload) => payload.run.runId === run.id)).toBe(true);
  });

  it('送信後に応答を失って再送しても同じ内容・Run IDを保ち、履歴の接続先を変更しない', async () => {
    const fixture = await executionFixture(harness);
    const attemptedPayloads: string[] = [];
    const sendPayload = vi.fn(async (payload: string) => {
      attemptedPayloads.push(payload);
      if (attemptedPayloads.length === 1) throw new Error('Fixture lost the acknowledgement after accepting the event');
    });
    const clientFactory = vi.fn<PluginClientFactory>(() => madoClientStub({ sendPayload }));
    const application = createApplication({ config: harness.config, database: harness.database, stores: harness.stores, pluginClientFactory: clientFactory });
    const connection = await entity<PluginConnection>(
      await request(application.app, `${fixture.basePath}/plugins`, {
        method: 'POST', cookie: fixture.administrator.cookie, body: madoPluginInput(),
      }),
    );
    const run = await fixture.newRun();
    await entity(await request(application.app, `${fixture.basePath}/runs/${run.id}`, {
      method: 'PATCH', cookie: fixture.editor.cookie, body: { status: 'finished' },
    }), 200);
    const snapshot = (await harness.database.query('SELECT event_id,payload,payload_hash,config_revision,destination_url FROM plugin_outbox')).rows[0];
    expect(snapshot.payload_hash).toBe(createHash('sha256').update(snapshot.payload).digest('hex'));
    expect(snapshot.config_revision).toBe(connection.configRevision);
    expect(snapshot.destination_url).toBe(MADO_CONFIG_FIXTURE.lineageUrl);
    for (const change of [
      'payload=payload||chr(32)',
      "payload_hash=repeat('0',64)",
      "destination_url='https://other-mado.example.test'",
      'config_revision=config_revision+1',
      "event='{}'::jsonb",
      'event_id=gen_random_uuid()',
    ])
      await expect(harness.database.query(`UPDATE plugin_outbox SET ${change} WHERE event_id=$1`, [snapshot.event_id]))
        .rejects.toThrow(/immutable/);
    expect(await application.outbox.dispatchBatch()).toBe(0);
    const updated = await entity<PluginConnection>(await request(application.app, `${fixture.basePath}/plugins/${connection.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { credentials: { lineageToken: 'rotated-fixture-write-key' }, expectedRevision: connection.configRevision },
    }), 200);
    const changedDestination = await request(application.app, `${fixture.basePath}/plugins/${connection.id}`, {
      method: 'PATCH', cookie: fixture.administrator.cookie,
      body: { config: { ...MADO_CONFIG_FIXTURE, lineageUrl: 'https://other-mado.example.test' }, expectedRevision: updated.configRevision },
    });
    expect(changedDestination.status).toBe(409);
    await entity(await request(application.app, `${fixture.basePath}/plugins/${connection.id}/events/retry`, {
      method: 'POST', cookie: fixture.administrator.cookie,
    }), 200);
    expect(await application.outbox.dispatchBatch()).toBe(1);
    expect(attemptedPayloads).toEqual([snapshot.payload, snapshot.payload]);
    expect(attemptedPayloads.map((payload) => JSON.parse(payload).run.runId)).toEqual([run.id, run.id]);
    expect(clientFactory.mock.calls.at(-1)?.[0]).toMatchObject({
      credentials: { readToken: MADO_CREDENTIALS_FIXTURE.readToken, lineageToken: 'rotated-fixture-write-key' },
      config: { lineageUrl: MADO_CONFIG_FIXTURE.lineageUrl },
    });
    expect((await harness.database.query('SELECT event_id,payload,payload_hash,status FROM plugin_outbox')).rows).toEqual([{
      event_id: snapshot.event_id, payload: snapshot.payload, payload_hash: snapshot.payload_hash, status: 'delivered',
    }]);
  });
});
