import { describe, expect, it, vi } from 'vitest';
import type { MadoAccessTokenGrant, MadoPluginConfig } from '@mmt/contracts';
import { createMadoClient, MadoApiError } from './madoClient.js';

const CONFIG: MadoPluginConfig = {
  apiUrl: 'https://api.mado.example.test/catalog-prefix',
  webUrl: 'https://mado.example.test',
  lineageUrl: 'https://ingest.mado.example.test/lineage-prefix',
  jobNamespace: 'ml-tracking', storageSystemKey: 'ml-tracking',
};
const CREDENTIALS = { accessToken: 'fixture-access-token' };
const GRANT: MadoAccessTokenGrant = {
  name: 'ML Tracking', scopes: ['lineage:read', 'lineage:write', 'metrics:read'],
  namespaces: ['allowed', 'ml-tracking'], expiresAt: null,
};
const DATASET_ID = '58dbbfe9-2a3c-4fbc-a2c3-050b94943f0a';
const VERSION_ID = 'e5aab0f8-acdc-40a4-8177-107b7ca5dba7';
const OTHER_ID = 'a30d9e65-190d-443f-8023-4a0105d14dc9';
const VERSION = {
  id: VERSION_ID, datasetId: DATASET_ID, namespace: 'allowed', name: 'Corpus', version: 'v1',
  contentHash: 'sha256:' + 'a'.repeat(64), manifestHash: null, manifestUri: 's3://fixture/corpus', schemaUri: null,
  locations: [{ uri: 's3://fixture/corpus', storageKind: 's3', status: 'available', isPrimary: true }],
};

/** Answers the token's own grant like Mado and every other request with `respond`. */
function madoFetcher(respond: (url: URL) => Response | Promise<Response>, grant: unknown = GRANT) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    return url.pathname.endsWith('/api/mado/access-token') ? Response.json({ id: OTHER_ID, ...(grant as object) }) : respond(url);
  });
}
function requestedPaths(fetcher: ReturnType<typeof madoFetcher>) {
  return fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname);
}

describe('内蔵MadoのHTTP通信と応答検証', () => {
  it('API・送信先のパスを保ち、すべての要求に同じアクセストークンを送る', async () => {
    const requests: { url: URL; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname.endsWith('/access-token')) return Response.json(GRANT);
      if (url.pathname.endsWith('/catalog')) return Response.json({ results: [], totalCount: 0 });
      if (url.pathname.endsWith('/metrics/capacity')) return new Response('storage_bytes 123\n');
      return Response.json({ accepted: true });
    };
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
    await client.catalog('allowed', 'Cor pus & training');
    const payload = '{"eventType":"COMPLETE","run":{"runId":"fixture"}}';
    await client.sendLineage(payload);
    expect(await client.capacityMetrics()).toBe('storage_bytes 123\n');
    expect(requests.map(({ url }) => url.origin + url.pathname)).toEqual([
      'https://api.mado.example.test/catalog-prefix/api/mado/access-token',
      'https://api.mado.example.test/catalog-prefix/api/mado/lineage/catalog',
      'https://ingest.mado.example.test/lineage-prefix/api/openlineage/v1/lineage',
      'https://api.mado.example.test/catalog-prefix/api/mado/metrics/capacity',
    ]);
    expect(requests[1]!.url.searchParams.get('namespace')).toBe('allowed');
    expect(requests[1]!.url.searchParams.get('q')).toBe('Cor pus & training');
    expect(new Set(requests.map(({ init }) => (init!.headers as Record<string, string>).Authorization)))
      .toEqual(new Set(['Bearer fixture-access-token']));
    expect(requests[2]!.init).toMatchObject({ method: 'POST', body: payload });
    expect(requests.every(({ init }) => init!.redirect === 'error' && init!.signal instanceof AbortSignal)).toBe(true);
  });

  it('トークンの許可範囲は1つのクライアントで1回だけ取得し、IDなど余分な項目は残さない', async () => {
    const fetcher = madoFetcher(() => Response.json(VERSION));
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
    expect(await client.accessTokenGrant()).toEqual(GRANT);
    await client.version(VERSION_ID);
    await client.version(VERSION_ID);
    expect(requestedPaths(fetcher).filter((path) => path.endsWith('/access-token'))).toHaveLength(1);
  });

  it('トークンが許可していないNamespaceと不正バージョンIDはネットワークへ出す前に拒否する', async () => {
    const fetcher = madoFetcher(() => Response.json(VERSION));
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
    await expect(client.catalog('forbidden', '')).rejects.toMatchObject({ status: 403 });
    await expect(client.catalog(null, '')).rejects.toMatchObject({ status: 403 });
    await expect(client.version('../outside')).rejects.toMatchObject({ status: 400 });
    await expect(client.dataset('unfixed')).rejects.toMatchObject({ status: 400 });
    expect(requestedPaths(fetcher).every((path) => path.endsWith('/access-token'))).toBe(true);
  });

  it('全Namespaceを許可したトークンはNamespaceを指定せずに検索し、応答のNamespaceを受け入れる', async () => {
    const fetcher = madoFetcher(() => Response.json({
      results: [{ datasetId: DATASET_ID, namespace: 'any', name: 'Corpus', currentVersionId: VERSION_ID }], totalCount: 1,
    }), { ...GRANT, namespaces: ['*'] });
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
    expect((await client.catalog(null, 'corpus')).results).toHaveLength(1);
    const catalogUrl = new URL(String(fetcher.mock.calls.at(-1)![0]));
    expect(catalogUrl.searchParams.has('namespace')).toBe(false);
    expect(catalogUrl.searchParams.get('q')).toBe('corpus');
  });

  it('許可範囲の応答が壊れていれば参照しない', async () => {
    for (const grant of [{ ...GRANT, namespaces: 'allowed' }, { ...GRANT, scopes: undefined }, { ...GRANT, expiresAt: 'tomorrow' }]) {
      const fetcher = madoFetcher(() => Response.json(VERSION), grant);
      const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
      await expect(client.version(VERSION_ID)).rejects.toMatchObject({ status: 502 });
    }
  });

  it('検索応答に別Namespaceが混ざると結果を利用しない', async () => {
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS,
      fetcher: madoFetcher(() => Response.json({
        results: [{ datasetId: DATASET_ID, namespace: 'ml-tracking', name: 'Corpus', currentVersionId: VERSION_ID }], totalCount: 1,
      })),
    });
    await expect(client.catalog('allowed', '')).rejects.toMatchObject({ status: 502 });
  });

  it('指定した固定バージョンを返し、異なるID・許可外のNamespace・資格情報付きURIは拒否する', async () => {
    let returnedVersion = VERSION;
    const fetcher = madoFetcher(() => Response.json(returnedVersion));
    expect(await createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher }).version(VERSION_ID)).toEqual(VERSION);
    returnedVersion = { ...VERSION, id: OTHER_ID };
    await expect(createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher }).version(VERSION_ID))
      .rejects.toMatchObject({ status: 502 });
    returnedVersion = { ...VERSION, namespace: 'forbidden' };
    await expect(createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher }).version(VERSION_ID))
      .rejects.toMatchObject({ status: 403 });
    returnedVersion = { ...VERSION, manifestUri: 'https://user:fixture-uri-secret@example.test/data' };
    const failure = await createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher })
      .version(VERSION_ID).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MadoApiError);
    expect(String(failure)).not.toContain('fixture-uri-secret');
  });

  it('Dataset応答の所属IDが一致しなければ他のDatasetのバージョンを使わない', async () => {
    const dataset = { datasetId: DATASET_ID, namespace: 'allowed', name: 'Corpus', versions: [{ ...VERSION, datasetId: OTHER_ID }] };
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher: madoFetcher(() => Response.json(dataset)) });
    await expect(client.dataset(DATASET_ID)).rejects.toMatchObject({ status: 502 });
  });

  it('大文字のDataset IDと小文字の応答、所属IDの大小差を同じ識別子として照合する', async () => {
    const { namespace, name, ...version } = VERSION;
    const dataset = {
      datasetId: DATASET_ID, namespace, name,
      versions: [{ ...version, datasetId: DATASET_ID.toUpperCase() }],
    };
    const fetcher = madoFetcher(() => Response.json(dataset));
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
    expect(await client.dataset(DATASET_ID.toUpperCase())).toEqual(dataset);
    expect(requestedPaths(fetcher)).toContain(`/catalog-prefix/api/mado/lineage/datasets/${DATASET_ID.toUpperCase()}`);
  });

  it('大文字の固定バージョンIDでも小文字の応答を取得し、応答の表記は変えない', async () => {
    const fetcher = madoFetcher(() => Response.json(VERSION));
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
    expect(await client.version(VERSION_ID.toUpperCase())).toEqual(VERSION);
    expect(requestedPaths(fetcher)).toContain(`/catalog-prefix/api/mado/lineage/versions/${VERSION_ID.toUpperCase()}`);
  });

  it('アクセストークンが未設定なら何も送信しない', async () => {
    const fetcher = madoFetcher(() => Response.json(VERSION));
    const client = createMadoClient({ config: CONFIG, credentials: {}, fetcher });
    await expect(client.version(VERSION_ID)).rejects.toMatchObject({ status: 503 });
    await expect(client.sendLineage('{}')).rejects.toMatchObject({ status: 503 });
    await expect(client.capacityMetrics()).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('送信の成功確認がaccepted:trueでなければ配信済みとして扱わない', async () => {
    for (const acknowledgment of [{ accepted: false }, { ok: true }, 'invalid-json']) {
      const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS,
        fetcher: async () => new Response(typeof acknowledgment === 'string' ? acknowledgment : JSON.stringify(acknowledgment)),
      });
      await expect(client.sendLineage('{}')).rejects.toMatchObject({ status: 502 });
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
      const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
      const failure = await client.catalog('allowed', '').catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(MadoApiError);
      expect(String(failure)).not.toContain(CREDENTIALS.accessToken);
    }
    expect(rejectedBody).toHaveBeenCalledOnce();
  });

  it('上限を超える応答は読み取りを中止してstreamを閉じる', async () => {
    const canceled = vi.fn();
    const oversized = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); },
      cancel: canceled,
    }));
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher: madoFetcher(() => oversized) });
    await expect(client.catalog('allowed', '')).rejects.toMatchObject({ status: 502 });
    expect(canceled).toHaveBeenCalledOnce();
  });

  it('ユーザー名・パスワードを含む接続先はクライアント作成時に拒否する', () => {
    expect(() => createMadoClient({
      config: { ...CONFIG, lineageUrl: 'https://user:fixture-service-password@ingest.example.test' }, credentials: CREDENTIALS,
    })).toThrow(MadoApiError);
  });
});
