import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DataCatalogReference,
  DataCatalogStorageConnection,
  Dataset,
  DatasetVersion,
  Model,
  ModelVersion,
} from '@mmt/contracts';
import { DataCatalogApiError, type DataCatalogClient } from '@mmt/platform';
import { createApplication } from '../src/app.js';
import { executionFixture } from './fixtures.js';
import { createHarness, entity, request, testDatabaseUrl, type Harness } from './harness.js';
import {
  DATA_CATALOG_ACCESS_TOKEN_FIXTURE,
  DATA_CATALOG_STORAGE_CONNECTIONS_FIXTURE,
  DATA_CATALOG_URL_FIXTURE,
  ON_PREMISES_STORAGE_CONNECTION_FIXTURE,
  dataCatalogClientStub,
} from './dataCatalogFixtures.js';

const ADMIN_ENDPOINT = '/api/admin/plugins/data-catalog';
const CONNECTION_INPUT = {
  url: DATA_CATALOG_URL_FIXTURE,
  accessToken: DATA_CATALOG_ACCESS_TOKEN_FIXTURE,
};
const ON_PREMISES = ON_PREMISES_STORAGE_CONNECTION_FIXTURE;
type Fixture = Awaited<ReturnType<typeof executionFixture>>;
const DIGEST = `sha256:${'0'.repeat(64)}`;

describe.skipIf(!testDatabaseUrl)('mado S3 Data Catalogのストレージ接続（独立PostgreSQL）', () => {
  let harness: Harness;
  beforeAll(async () => { harness = await createHarness(); });
  beforeEach(async () => { await harness.reset(); });
  afterAll(async () => { await harness?.close(); });

  function applicationWith(overrides: Partial<DataCatalogClient> = {}) {
    return createApplication({
      config: harness.config, database: harness.database, stores: harness.stores,
      dataCatalogClientFactory: () => dataCatalogClientStub(overrides),
    });
  }
  async function connect(app: ReturnType<typeof applicationWith>['app'], fixture: Fixture) {
    return request(app, ADMIN_ENDPOINT, {
      method: 'PUT', cookie: fixture.administrator.cookie, body: CONNECTION_INPUT,
    });
  }
  async function createDataset(app: ReturnType<typeof applicationWith>['app'], fixture: Fixture) {
    return entity<Dataset>(
      await request(app, `${fixture.basePath}/datasets`, {
        method: 'POST', cookie: fixture.editor.cookie, body: { name: 'Corpus' },
      }),
    );
  }
  /** 接続済みのサイトと、バージョンを登録する関数。 */
  async function connectedRegistry(overrides: Partial<DataCatalogClient> = {}) {
    const fixture = await executionFixture(harness);
    const { app, services } = applicationWith(overrides);
    await entity(await connect(app, fixture), 200);
    const dataset = await createDataset(app, fixture);
    const registerDatasetVersion = (body: Record<string, unknown>, cookie = fixture.editor.cookie) =>
      request(app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
        method: 'POST', cookie, body: { digest: DIGEST, ...body },
      });
    return { fixture, app, services, dataset, registerDatasetVersion };
  }

  describe('接続', () => {
    it('ストレージ接続の一覧のAPIが無いmado S3 Data Catalogには、更新が要ると伝えて保存しない', async () => {
      const fixture = await executionFixture(harness);
      const { app } = applicationWith({
        storageConnections: async () => { throw new DataCatalogApiError(404); },
      });
      const response = await connect(app, fixture);
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        code: 'data_catalog_storage_connections_unsupported',
        error: expect.stringContaining('v0.6.1'),
      });
      expect((await harness.database.query('SELECT 1 FROM data_catalog_connection')).rowCount).toBe(0);
    });

    it('接続を確かめ直すと、ストレージ接続の一覧を読み直す', async () => {
      const fixture = await executionFixture(harness);
      let listed = [ON_PREMISES];
      const { app } = applicationWith({ storageConnections: async () => listed });
      await entity(await connect(app, fixture), 200);
      listed = DATA_CATALOG_STORAGE_CONNECTIONS_FIXTURE;
      const rechecked = await entity<{ connection: { storageConnections: unknown[] } }>(
        await request(app, ADMIN_ENDPOINT, {
          method: 'PUT', cookie: fixture.administrator.cookie, body: { url: DATA_CATALOG_URL_FIXTURE },
        }), 200,
      );
      expect(rechecked.connection.storageConnections).toEqual(DATA_CATALOG_STORAGE_CONNECTIONS_FIXTURE);
    });
  });

  describe('Projectのメンバーに見せる内容', () => {
    it('Projectを読める人は、画面のURLとストレージ接続を読める。権限と容量は含まない', async () => {
      const { fixture, app } = await connectedRegistry();
      const response = await request(app, `${fixture.basePath}/data-catalog`, { cookie: fixture.viewer.cookie });
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(JSON.parse(body) satisfies DataCatalogReference).toEqual({
        url: DATA_CATALOG_URL_FIXTURE,
        storageConnections: DATA_CATALOG_STORAGE_CONNECTIONS_FIXTURE,
      });
      expect(body).not.toContain('metrics:read');
      expect((await request(app, ADMIN_ENDPOINT, { cookie: fixture.viewer.cookie })).status).toBe(403);
    });

    it('Projectを読めない人には403を返す', async () => {
      const { fixture, app } = await connectedRegistry();
      expect(
        (await request(app, `${fixture.basePath}/data-catalog`, { cookie: fixture.outsider.cookie })).status,
      ).toBe(403);
    });

    it('未接続ならurlがnullで、ストレージ接続は無い', async () => {
      const fixture = await executionFixture(harness);
      const { app } = applicationWith();
      expect(
        await entity(await request(app, `${fixture.basePath}/data-catalog`, { cookie: fixture.viewer.cookie }), 200),
      ).toEqual({ url: null, storageConnections: [] });
    });
  });

  describe('データセットのバージョンの登録', () => {
    it('接続済みなら、s3://のURIにはストレージ接続が要る', async () => {
      const { registerDatasetVersion } = await connectedRegistry();
      // v0.5.4までのPython SDKが送る本文。
      const response = await registerDatasetVersion({ version: 'v1', uri: 's3://corpus/ja/', externalRef: null });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: 'data_catalog_storage_connection_required',
        error: expect.stringContaining('dataCatalogStorageConnectionId'),
      });
    });

    it('一覧にあるストレージ接続を指定すると保存し、バージョンに返す', async () => {
      const { fixture, app, dataset, registerDatasetVersion } = await connectedRegistry();
      const version = await entity<DatasetVersion>(
        await registerDatasetVersion({
          version: 'v1', uri: 's3://corpus/ja/', dataCatalogStorageConnectionId: ON_PREMISES.id,
        }),
      );
      expect(version).toMatchObject({
        uri: 's3://corpus/ja/', dataCatalogStorageConnectionId: ON_PREMISES.id,
      });
      const listed = await entity<{ items: DatasetVersion[] }>(
        await request(app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
          cookie: fixture.viewer.cookie,
        }), 200,
      );
      expect(listed.items.map((item) => item.dataCatalogStorageConnectionId)).toEqual([ON_PREMISES.id]);
    });

    it('知らないストレージ接続は、一覧を1回読み直してから断る', async () => {
      const storageConnections = vi.fn(async () => [ON_PREMISES]);
      const { registerDatasetVersion } = await connectedRegistry({ storageConnections });
      storageConnections.mockClear();
      const response = await registerDatasetVersion({
        version: 'v1', uri: 's3://corpus/ja/', dataCatalogStorageConnectionId: 'unknown01',
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: 'data_catalog_storage_connection_unknown' });
      expect(storageConnections).toHaveBeenCalledTimes(1);
    });

    it('接続のあとにmado S3 Data Catalogへ足したストレージ接続は、読み直して受け付ける', async () => {
      const added: DataCatalogStorageConnection = { id: 'added01', name: 'added', provider: 'other' };
      let listed = [ON_PREMISES];
      const { fixture, app, registerDatasetVersion } = await connectedRegistry({
        storageConnections: async () => listed,
      });
      listed = [ON_PREMISES, added];
      const version = await entity<DatasetVersion>(
        await registerDatasetVersion({
          version: 'v1', uri: 's3://corpus/ja/', dataCatalogStorageConnectionId: added.id,
        }),
      );
      expect(version.dataCatalogStorageConnectionId).toBe(added.id);
      const reference = await entity<DataCatalogReference>(
        await request(app, `${fixture.basePath}/data-catalog`, { cookie: fixture.viewer.cookie }), 200,
      );
      expect(reference.storageConnections).toEqual(listed);
    });

    it('mado S3 Data Catalogと通信できなくても、覚えているストレージ接続なら登録できる', async () => {
      let reachable = true;
      const { registerDatasetVersion } = await connectedRegistry({
        storageConnections: async () => {
          if (!reachable) throw new DataCatalogApiError(503);
          return [ON_PREMISES];
        },
      });
      reachable = false;
      await entity(
        await registerDatasetVersion({
          version: 'v1', uri: 's3://corpus/ja/', dataCatalogStorageConnectionId: ON_PREMISES.id,
        }),
      );
      const unknown = await registerDatasetVersion({
        version: 'v2', uri: 's3://corpus/ja/', dataCatalogStorageConnectionId: 'unknown01',
      });
      expect(unknown.status).toBe(422);
    });

    it('s3://でないURIと、Artifactを中身にするバージョンには指定できない', async () => {
      const { registerDatasetVersion } = await connectedRegistry();
      const withId = { dataCatalogStorageConnectionId: ON_PREMISES.id };
      for (const body of [
        { version: 'v1', uri: 'file:///data', ...withId },
        { version: 'v1', uri: 'https://example.test/data.tar', ...withId },
      ]) {
        const response = await registerDatasetVersion(body);
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
          code: 'data_catalog_storage_connection_not_applicable',
        });
      }
      await entity(await registerDatasetVersion({ version: 'v1', uri: 'file:///data' }));
    });

    it('未接続なら、s3://のURIをストレージ接続なしで登録でき、指定は断る', async () => {
      const fixture = await executionFixture(harness);
      const { app } = applicationWith();
      const dataset = await createDataset(app, fixture);
      const register = (body: Record<string, unknown>) =>
        request(app, `${fixture.basePath}/datasets/${dataset.id}/versions`, {
          method: 'POST', cookie: fixture.editor.cookie, body: { digest: DIGEST, ...body },
        });
      const version = await entity<DatasetVersion>(await register({ version: 'v1', uri: 's3://corpus/ja/' }));
      expect(version.dataCatalogStorageConnectionId).toBeNull();
      const refused = await register({
        version: 'v2', uri: 's3://corpus/ja/', dataCatalogStorageConnectionId: ON_PREMISES.id,
      });
      expect(refused.status).toBe(422);
      expect(await refused.json()).toMatchObject({
        code: 'data_catalog_storage_connection_not_applicable',
      });
    });

    it('編集できない人には、ストレージ接続の指定の誤りより先に403を返す', async () => {
      const { fixture, registerDatasetVersion } = await connectedRegistry();
      const response = await registerDatasetVersion(
        { version: 'v1', uri: 's3://corpus/ja/' }, fixture.viewer.cookie,
      );
      expect(response.status).toBe(403);
    });

    it('人やSDK以外が作るバージョン（MLflowの入力など）は、接続済みでもストレージ接続なしで作れる', async () => {
      const { fixture, services, dataset } = await connectedRegistry();
      const version = await services.registry.insertDatasetVersion(harness.database, fixture.project.id, {
        datasetId: dataset.id,
        input: {
          version: 'machine', uri: 's3://corpus/ja/', digest: DIGEST, schema: {}, metadata: {},
          parentDatasetVersionIds: [],
        },
      });
      expect(version.dataCatalogStorageConnectionId).toBeNull();
    });
  });

  describe('モデルのバージョンの登録', () => {
    async function connectedModel() {
      const registry = await connectedRegistry();
      const { fixture, app } = registry;
      const model = await entity<Model>(
        await request(app, `${fixture.basePath}/models`, {
          method: 'POST', cookie: fixture.editor.cookie, body: { name: 'Speech', family: 'qwen2' },
        }),
      );
      const registerModelVersion = (body: Record<string, unknown>, cookie = fixture.editor.cookie) =>
        request(app, `${fixture.basePath}/models/${model.id}/versions`, { method: 'POST', cookie, body });
      return { ...registry, registerModelVersion };
    }

    it('接続済みなら、s3://の重みのURIにはストレージ接続が要り、指定すると保存する', async () => {
      const { registerModelVersion } = await connectedModel();
      const missing = await registerModelVersion({ version: 'v1', weightsUri: 's3://models/v1.bin' });
      expect(missing.status).toBe(422);
      expect(await missing.json()).toMatchObject({ code: 'data_catalog_storage_connection_required' });
      const version = await entity<ModelVersion>(
        await registerModelVersion({
          version: 'v1', weightsUri: 's3://models/v1.bin', dataCatalogStorageConnectionId: ON_PREMISES.id,
        }),
      );
      expect(version.dataCatalogStorageConnectionId).toBe(ON_PREMISES.id);
    });

    it('重みのURIが無い、またはs3://でないバージョンには指定できず、指定なしなら作れる', async () => {
      const { registerModelVersion } = await connectedModel();
      const refused = await registerModelVersion({
        version: 'v1', dataCatalogStorageConnectionId: ON_PREMISES.id,
      });
      expect(refused.status).toBe(422);
      expect(await refused.json()).toMatchObject({
        code: 'data_catalog_storage_connection_not_applicable',
      });
      const version = await entity<ModelVersion>(
        await registerModelVersion({ version: 'v1', weightsUri: 'file:///models/v1.bin' }),
      );
      expect(version.dataCatalogStorageConnectionId).toBeNull();
    });

    it('編集できない人には、ストレージ接続の指定の誤りより先に403を返す', async () => {
      const { fixture, registerModelVersion } = await connectedModel();
      const response = await registerModelVersion(
        { version: 'v1', weightsUri: 's3://models/v1.bin' }, fixture.viewer.cookie,
      );
      expect(response.status).toBe(403);
    });
  });
});
