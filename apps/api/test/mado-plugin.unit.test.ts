import { describe, expect, it, vi } from 'vitest';
import type { MadoAccessTokenGrant } from '@mmt/contracts';
import { createMadoPlugin } from '../src/plugins/mado/madoPlugin.js';
import { MADO_CONFIG_FIXTURE, MADO_CREDENTIALS_FIXTURE } from './pluginFixtures.js';

const WITHOUT_CAPACITY: MadoAccessTokenGrant = {
  name: 'ML Tracking',
  scopes: [],
  expiresAt: '2027-01-01T00:00:00.000Z',
};
const WITH_CAPACITY: MadoAccessTokenGrant = { ...WITHOUT_CAPACITY, scopes: ['metrics:read'] };

/** tokenに`grant`を与えたmado S3 Data Catalog。 */
function madoFixture(grant: MadoAccessTokenGrant) {
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/mado/access-token') return Response.json(grant);
    if (url.pathname === '/api/mado/metrics/capacity') return new Response('mado_storage_bucket_bytes 1\n');
    return new Response(null, { status: 404 });
  });
  const plugin = createMadoPlugin({
    config: { ...MADO_CONFIG_FIXTURE, apiUrl: 'https://mado.example.test' },
    credentials: MADO_CREDENTIALS_FIXTURE,
    fetcher,
  });
  const requestedPaths = () => fetcher.mock.calls.map(([called]) => new URL(String(called)).pathname);
  return { plugin, requestedPaths };
}

describe('内蔵Mado連携の接続確認（アクセストークンの許可範囲）', () => {
  it('接続確認でトークンの許可範囲を取得し、容量を読めることを確かめる', async () => {
    const { plugin, requestedPaths } = madoFixture(WITH_CAPACITY);
    const checked = await plugin.checkConnection();
    expect(checked.accessTokenGrant).toEqual(WITH_CAPACITY);
    expect(checked.manifest.capabilities).toEqual(['storage:metrics']);
    expect(requestedPaths()).toEqual(['/api/mado/access-token', '/api/mado/metrics/capacity']);
  });

  it('容量を許可していないトークンでは容量を問い合わせず、容量の機能を名乗らない', async () => {
    const { plugin, requestedPaths } = madoFixture(WITHOUT_CAPACITY);
    expect((await plugin.checkConnection()).manifest.capabilities).toEqual([]);
    expect(requestedPaths()).toEqual(['/api/mado/access-token']);
  });

  it('DataLineageのscopeが残る古いMadoのトークンでも、容量の許可だけを見て接続を確認する', async () => {
    const { plugin } = madoFixture({ ...WITH_CAPACITY, scopes: ['lineage:read', 'lineage:write', 'metrics:read'] });
    const checked = await plugin.checkConnection();
    expect(checked.accessTokenGrant.scopes).toEqual(['lineage:read', 'lineage:write', 'metrics:read']);
    expect(checked.manifest.capabilities).toEqual(['storage:metrics']);
  });

  it('アクセストークンの許可範囲を返せない古いMadoには、Madoの更新が必要だと示す', async () => {
    const plugin = createMadoPlugin({
      config: { ...MADO_CONFIG_FIXTURE, apiUrl: 'https://mado.example.test' },
      credentials: MADO_CREDENTIALS_FIXTURE,
      fetcher: async () => new Response(null, { status: 404 }),
    });
    await expect(plugin.checkConnection()).rejects.toMatchObject({
      status: 502, code: 'plugin_mado_access_token_unsupported',
    });
  });

  it('容量の取得は、Madoが返したPrometheusの本文をそのまま返す', async () => {
    const { plugin } = madoFixture(WITH_CAPACITY);
    expect(await plugin.metrics()).toEqual({ prometheus: 'mado_storage_bucket_bytes 1\n' });
  });
});
