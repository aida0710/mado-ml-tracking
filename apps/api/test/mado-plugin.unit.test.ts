import { describe, expect, it, vi } from 'vitest';
import type { MadoAccessTokenGrant } from '@mmt/contracts';
import { createMadoPlugin } from '../src/plugins/mado/madoPlugin.js';
import { MADO_CONFIG_FIXTURE, MADO_CREDENTIALS_FIXTURE } from './pluginFixtures.js';

const DATASET_ID = '58dbbfe9-2a3c-4fbc-a2c3-050b94943f0a';
const VERSION_ID = 'e5aab0f8-acdc-40a4-8177-107b7ca5dba7';
const READ_AND_SEND: MadoAccessTokenGrant = {
  name: 'ML Tracking',
  scopes: ['lineage:read', 'lineage:write'],
  namespaces: ['mado-model-tracking', 'speech'],
  expiresAt: '2027-01-01T00:00:00.000Z',
};

/**
 * tokenに`grant`を与え、どのnamespaceにもデータセットバージョンを1つ持つ
 * mado S3 Data Catalog。
 */
function madoFixture(grant: MadoAccessTokenGrant) {
  const version = {
    id: VERSION_ID, datasetId: DATASET_ID, version: 'v1', contentHash: `sha256:${'a'.repeat(64)}`,
    manifestHash: null, manifestUri: null, schemaUri: null,
    locations: [{ uri: 's3://fixture/corpus', storageKind: 's3', status: 'available', isPrimary: true }],
  };
  // データセットは最後に検索したnamespaceに属する。全namespaceの検索では`speech`で見つかる。
  let searchedNamespace = 'speech';
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/mado/access-token') return Response.json(grant);
    if (url.pathname === '/api/mado/lineage/catalog') {
      searchedNamespace = url.searchParams.get('namespace') ?? 'speech';
      return Response.json({
        results: [{ datasetId: DATASET_ID, namespace: searchedNamespace, name: 'corpus', currentVersionId: VERSION_ID }],
        totalCount: 1,
      });
    }
    if (url.pathname === `/api/mado/lineage/datasets/${DATASET_ID}`)
      return Response.json({ datasetId: DATASET_ID, namespace: searchedNamespace, name: 'corpus', versions: [version] });
    if (url.pathname === '/api/mado/metrics/capacity') return new Response('mado_storage_bucket_bytes 1\n');
    return new Response(null, { status: 404 });
  });
  const plugin = createMadoPlugin({
    config: { ...MADO_CONFIG_FIXTURE, apiUrl: 'https://mado.example.test' },
    credentials: MADO_CREDENTIALS_FIXTURE,
    fetcher,
  });
  const requests = () => fetcher.mock.calls.map(([called]) => new URL(String(called)));
  return { plugin, requests };
}

describe('内蔵Mado連携の接続確認と検索（アクセストークンの許可範囲）', () => {
  it('接続確認でトークンの許可範囲を取得し、許可された各Namespaceと容量を確かめる', async () => {
    const grant = { ...READ_AND_SEND, scopes: [...READ_AND_SEND.scopes, 'metrics:read'] };
    const { plugin, requests } = madoFixture(grant);
    const checked = await plugin.checkConnection();
    expect(checked.accessTokenGrant).toEqual(grant);
    expect(checked.manifest.capabilities).toEqual(['datasets:search', 'lineage:publish', 'storage:metrics']);
    expect(requests().map((url) => `${url.pathname}?${url.searchParams.get('namespace') ?? ''}`)).toEqual([
      '/api/mado/access-token?',
      '/api/mado/lineage/catalog?mado-model-tracking',
      '/api/mado/lineage/catalog?speech',
      '/api/mado/metrics/capacity?',
    ]);
  });

  it('容量を許可していないトークンでは容量を問い合わせず、容量の機能を名乗らない', async () => {
    const { plugin, requests } = madoFixture(READ_AND_SEND);
    expect((await plugin.checkConnection()).manifest.capabilities).toEqual(['datasets:search', 'lineage:publish']);
    expect(requests().some((url) => url.pathname.endsWith('/metrics/capacity'))).toBe(false);
  });

  it('送信または読み取りを許可していないトークンは、データを参照する前に理由を示して拒否する', async () => {
    for (const [scopes, missing] of [
      [['lineage:read'], 'lineage:write'],
      [['lineage:write', 'metrics:read'], 'lineage:read'],
    ] as const) {
      const { plugin, requests } = madoFixture({ ...READ_AND_SEND, scopes: [...scopes] });
      await expect(plugin.checkConnection()).rejects.toMatchObject({
        status: 422, code: 'plugin_token_scope_missing', details: { scopes: [missing] },
      });
      expect(requests().map((url) => url.pathname)).toEqual(['/api/mado/access-token']);
    }
  });

  it('RunのNamespaceを許可していないトークンは、送信が失敗する前に接続確認で拒否する', async () => {
    const { plugin } = madoFixture({ ...READ_AND_SEND, namespaces: ['speech'] });
    await expect(plugin.checkConnection()).rejects.toMatchObject({
      status: 422, code: 'plugin_job_namespace_not_allowed',
      details: { namespace: MADO_CONFIG_FIXTURE.jobNamespace },
    });
  });

  it('アクセストークンの許可範囲を返せない古いMadoには、Madoの更新が必要だと示す', async () => {
    const plugin = createMadoPlugin({
      config: { ...MADO_CONFIG_FIXTURE, apiUrl: 'https://mado.example.test' },
      credentials: MADO_CREDENTIALS_FIXTURE,
      fetcher: async () => new Response(null, { status: 404 }),
    });
    for (const operation of [() => plugin.checkConnection(), () => plugin.searchDatasets(''), () => plugin.datasetVersion(VERSION_ID)])
      await expect(operation()).rejects.toMatchObject({ status: 502, code: 'plugin_mado_access_token_unsupported' });
  });

  it('検索はトークンが許可したNamespaceごとに行い、全Namespaceのトークンでは1回でまとめて検索する', async () => {
    const restricted = madoFixture(READ_AND_SEND);
    const found = await restricted.plugin.searchDatasets('corpus');
    expect(found.items.map((item) => item.namespace)).toEqual(['mado-model-tracking', 'speech']);
    const everything = madoFixture({ ...READ_AND_SEND, namespaces: ['*'] });
    expect((await everything.plugin.searchDatasets('corpus')).items.map((item) => item.namespace)).toEqual(['speech']);
    const catalogRequests = everything.requests().filter((url) => url.pathname.endsWith('/catalog'));
    expect(catalogRequests).toHaveLength(1);
    expect(catalogRequests[0]!.searchParams.has('namespace')).toBe(false);
  });
});
