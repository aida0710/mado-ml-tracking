import { describe, expect, it, vi } from 'vitest';
import { createDataCatalogClient, DataCatalogApiError } from './dataCatalogClient.js';

const CONNECTION = {
  url: 'https://catalog.example.test/catalog-prefix',
  accessToken: 'fixture-access-token',
};
const TOKEN_ID = 'a30d9e65-190d-443f-8023-4a0105d14dc9';
/** mado S3 Data Catalog v0.6.1以降の`GET /api/mado/access-token`の応答。 */
const ACCESS_TOKEN_RESPONSE = {
  id: TOKEN_ID, name: 'ML Tracking', scopes: ['metrics:read'], expiresAt: '2027-01-01T00:00:00.000Z',
};
/** v0.5.3までの応答。DataLineageのscopeとNamespaceが付く。 */
const ACCESS_TOKEN_RESPONSE_WITH_NAMESPACES = {
  ...ACCESS_TOKEN_RESPONSE,
  scopes: ['lineage:read', 'lineage:write', 'metrics:read'],
  namespaces: ['allowed', 'ml-tracking'],
};

describe('mado S3 Data CatalogとのHTTP通信と応答の検証', () => {
  it('画面のURLの下のAPIを呼び、すべての要求に同じアクセストークンを送る', async () => {
    const requests: { url: URL; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      return url.pathname.endsWith('/access-token')
        ? Response.json(ACCESS_TOKEN_RESPONSE)
        : new Response('storage_bytes 123\n');
    };
    const client = createDataCatalogClient({ ...CONNECTION, fetcher });
    await client.accessTokenGrant();
    expect(await client.capacityMetrics()).toBe('storage_bytes 123\n');
    expect(requests.map(({ url }) => url.origin + url.pathname)).toEqual([
      'https://catalog.example.test/catalog-prefix/api/mado/access-token',
      'https://catalog.example.test/catalog-prefix/api/mado/metrics/capacity',
    ]);
    expect(new Set(requests.map(({ init }) => (init!.headers as Record<string, string>).Authorization)))
      .toEqual(new Set(['Bearer fixture-access-token']));
    expect(requests.every(({ init }) => init!.method === undefined && init!.body === undefined)).toBe(true);
    expect(requests.every(({ init }) => init!.redirect === 'error' && init!.signal instanceof AbortSignal)).toBe(true);
  });

  it('ストレージ接続は画面のURLの下の/api/mado/connectionsから読み、ID・名前・種類だけを残す', async () => {
    const requested: URL[] = [];
    const client = createDataCatalogClient({
      ...CONNECTION,
      fetcher: async (input) => {
        requested.push(new URL(String(input)));
        return Response.json({
          items: [{ id: 'onprem01', name: 'on-premises', provider: 'onprem', endpoint: 'https://s3.example.test' }],
        });
      },
    });
    expect(await client.storageConnections()).toEqual([
      { id: 'onprem01', name: 'on-premises', provider: 'onprem' },
    ]);
    expect(requested.map((url) => url.pathname)).toEqual(['/catalog-prefix/api/mado/connections']);
  });

  it('ストレージ接続の応答が決まった形でなければ502にする', async () => {
    const client = createDataCatalogClient({
      ...CONNECTION, fetcher: async () => Response.json({ items: [{ id: 'onprem01' }] }),
    });
    await expect(client.storageConnections()).rejects.toMatchObject({ status: 502 });
  });

  it('トークンの許可範囲は名前・scope・有効期限だけを残し、IDは残さない', async () => {
    const client = createDataCatalogClient({
      ...CONNECTION, fetcher: async () => Response.json(ACCESS_TOKEN_RESPONSE),
    });
    expect(await client.accessTokenGrant()).toEqual({
      name: 'ML Tracking', scopes: ['metrics:read'], expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('Namespaceを返す古いmado S3 Data Catalogの応答も受け付け、Namespaceは残さない', async () => {
    const client = createDataCatalogClient({
      ...CONNECTION,
      fetcher: async () => Response.json(ACCESS_TOKEN_RESPONSE_WITH_NAMESPACES),
    });
    expect(await client.accessTokenGrant()).toEqual({
      name: 'ML Tracking', scopes: ['lineage:read', 'lineage:write', 'metrics:read'],
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('許可範囲の応答が壊れていれば受け付けない', async () => {
    for (const broken of [{ name: 'ML Tracking' }, { ...ACCESS_TOKEN_RESPONSE, scopes: 'metrics:read' }, { ...ACCESS_TOKEN_RESPONSE, expiresAt: 'tomorrow' }]) {
      const client = createDataCatalogClient({
        ...CONNECTION, fetcher: async () => Response.json(broken),
      });
      await expect(client.accessTokenGrant()).rejects.toMatchObject({ status: 502 });
    }
  });

  it('HTTP失敗・壊れたJSON・通信例外はアクセストークンや応答本文をエラーへ含めない', async () => {
    const rejectedBody = vi.fn();
    const rejectedResponse = new Response(new ReadableStream({ cancel: rejectedBody }), { status: 403 });
    const cases: typeof fetch[] = [
      async () => rejectedResponse,
      async () => new Response('{"secret":"fixture-access-token"'),
      async () => { throw new Error('fixture-access-token'); },
    ];
    for (const fetcher of cases) {
      const client = createDataCatalogClient({ ...CONNECTION, fetcher });
      const failure = await client.accessTokenGrant().catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(DataCatalogApiError);
      expect(String(failure)).not.toContain(CONNECTION.accessToken);
    }
    expect(rejectedBody).toHaveBeenCalledOnce();
  });

  it('上限を超える応答は読み取りを中止してstreamを閉じる', async () => {
    const canceled = vi.fn();
    const oversized = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); },
      cancel: canceled,
    }));
    const client = createDataCatalogClient({ ...CONNECTION, fetcher: async () => oversized });
    await expect(client.capacityMetrics()).rejects.toMatchObject({ status: 502 });
    expect(canceled).toHaveBeenCalledOnce();
  });

  it('ユーザー名・パスワードを含む接続先はクライアント作成時に拒否する', () => {
    expect(() => createDataCatalogClient({
      ...CONNECTION, url: 'https://user:fixture-service-password@catalog.example.test',
    })).toThrow(DataCatalogApiError);
  });
});
