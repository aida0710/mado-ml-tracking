import { describe, expect, it, vi } from 'vitest';
import type { MadoPluginConfig } from '@mmt/contracts';
import { createMadoClient, MadoApiError } from './madoClient.js';

const CONFIG: MadoPluginConfig = {
  apiUrl: 'https://api.mado.example.test/catalog-prefix',
  webUrl: 'https://mado.example.test',
  lineageUrl: 'https://ingest.mado.example.test/lineage-prefix',
  namespaces: ['allowed'], jobNamespace: 'ml-tracking', storageSystemKey: 'ml-tracking',
};
const CREDENTIALS = { readToken: 'fixture-read-key', lineageToken: 'fixture-write-key', metricsToken: 'fixture-metrics-key' };
const DATASET_ID = '58dbbfe9-2a3c-4fbc-a2c3-050b94943f0a';
const VERSION_ID = 'e5aab0f8-acdc-40a4-8177-107b7ca5dba7';
const OTHER_ID = 'a30d9e65-190d-443f-8023-4a0105d14dc9';
const VERSION = {
  id: VERSION_ID, datasetId: DATASET_ID, namespace: 'allowed', name: 'Corpus', version: 'v1',
  contentHash: 'sha256:' + 'a'.repeat(64), manifestHash: null, manifestUri: 's3://fixture/corpus', schemaUri: null,
  locations: [{ uri: 's3://fixture/corpus', storageKind: 's3', status: 'available', isPrimary: true }],
};

describe('内蔵MadoのHTTP通信と応答検証', () => {
  it('API・送信先のパスを保ち、用途別のキーを対応するAPIにだけ送る', async () => {
    const requests: { url: URL; init: RequestInit | undefined }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, init });
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
      'https://api.mado.example.test/catalog-prefix/api/mado/lineage/catalog',
      'https://ingest.mado.example.test/lineage-prefix/api/openlineage/v1/lineage',
      'https://api.mado.example.test/catalog-prefix/api/mado/metrics/capacity',
    ]);
    expect(requests[0]!.url.searchParams.get('namespace')).toBe('allowed');
    expect(requests[0]!.url.searchParams.get('q')).toBe('Cor pus & training');
    expect(requests.map(({ init }) => (init!.headers as Record<string, string>).Authorization)).toEqual([
      'Bearer fixture-read-key', 'Bearer fixture-write-key', 'Bearer fixture-metrics-key',
    ]);
    expect(requests[1]!.init).toMatchObject({ method: 'POST', body: payload });
    expect(requests.every(({ init }) => init!.redirect === 'error' && init!.signal instanceof AbortSignal)).toBe(true);
  });

  it('許可外Namespaceと不正バージョンIDはネットワークへ出す前に拒否する', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(VERSION));
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
    await expect(client.catalog('forbidden', '')).rejects.toMatchObject({ status: 403 });
    await expect(client.version('../outside')).rejects.toMatchObject({ status: 400 });
    await expect(client.dataset('unfixed')).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('検索応答に別Namespaceが混ざると結果を利用しない', async () => {
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS,
      fetcher: async () => Response.json({
        results: [{ datasetId: DATASET_ID, namespace: 'forbidden', name: 'Corpus', currentVersionId: VERSION_ID }], totalCount: 1,
      }),
    });
    await expect(client.catalog('allowed', '')).rejects.toMatchObject({ status: 502 });
  });

  it('指定した固定バージョンを返し、異なるID・Namespace・資格情報付きURIは拒否する', async () => {
    let returnedVersion = VERSION;
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher: async () => Response.json(returnedVersion) });
    expect(await client.version(VERSION_ID)).toEqual(VERSION);
    returnedVersion = { ...VERSION, id: OTHER_ID };
    await expect(client.version(VERSION_ID)).rejects.toMatchObject({ status: 502 });
    returnedVersion = { ...VERSION, namespace: 'forbidden' };
    await expect(client.version(VERSION_ID)).rejects.toMatchObject({ status: 403 });
    returnedVersion = { ...VERSION, manifestUri: 'https://user:fixture-uri-secret@example.test/data' };
    const failure = await client.version(VERSION_ID).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MadoApiError);
    expect(String(failure)).not.toContain('fixture-uri-secret');
  });

  it('Dataset応答の所属IDが一致しなければ他のDatasetのバージョンを使わない', async () => {
    const dataset = { datasetId: DATASET_ID, namespace: 'allowed', name: 'Corpus', versions: [{ ...VERSION, datasetId: OTHER_ID }] };
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher: async () => Response.json(dataset) });
    await expect(client.dataset(DATASET_ID)).rejects.toMatchObject({ status: 502 });
  });

  it('キーが未設定の操作は送信せず、readキーだけで参照できる', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(VERSION));
    const client = createMadoClient({ config: CONFIG, credentials: { readToken: CREDENTIALS.readToken }, fetcher });
    expect((await client.version(VERSION_ID)).id).toBe(VERSION_ID);
    fetcher.mockClear();
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

  it('HTTP失敗・壊れたJSON・通信例外は認証キーや応答本文をエラーへ含めない', async () => {
    const rejectedBody = vi.fn();
    const rejectedResponse = new Response(new ReadableStream({ cancel: rejectedBody }), { status: 403 });
    const cases: typeof fetch[] = [
      async () => rejectedResponse,
      async () => new Response('{"secret":"fixture-read-key"'),
      async () => { throw new Error('fixture-read-key'); },
    ];
    for (const fetcher of cases) {
      const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher });
      const failure = await client.catalog('allowed', '').catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(MadoApiError);
      expect(String(failure)).not.toContain(CREDENTIALS.readToken);
    }
    expect(rejectedBody).toHaveBeenCalledOnce();
  });

  it('上限を超える応答は読み取りを中止してstreamを閉じる', async () => {
    const canceled = vi.fn();
    const oversized = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); },
      cancel: canceled,
    }));
    const client = createMadoClient({ config: CONFIG, credentials: CREDENTIALS, fetcher: async () => oversized });
    await expect(client.catalog('allowed', '')).rejects.toMatchObject({ status: 502 });
    expect(canceled).toHaveBeenCalledOnce();
  });

  it('ユーザー名・パスワードを含む接続先はクライアント作成時に拒否する', () => {
    expect(() => createMadoClient({
      config: { ...CONFIG, lineageUrl: 'https://user:fixture-service-password@ingest.example.test' }, credentials: CREDENTIALS,
    })).toThrow(MadoApiError);
  });
});
