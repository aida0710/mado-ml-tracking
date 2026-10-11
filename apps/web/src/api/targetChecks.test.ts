import { afterEach, describe, expect, it, vi } from 'vitest';
import { targetChecksApi } from './targetChecks';

afterEach(() => vi.unstubAllGlobals());
function stubJsonResponse(body: unknown, status = 200) {
  const fetch = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('接続確認とディレクトリの読み取りのAPI呼び出し', () => {
  it('workerを選んだ確認は本文でworkerを送り、選ばない確認は本文を送らない', async () => {
    const fetch = stubJsonResponse({ id: 'check' }, 201);
    const worker = { tokenId: 'token', workerId: 'gpu-worker' };
    await targetChecksApi.request('target', worker);
    await targetChecksApi.request('target');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/targets/target/checks');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ worker });
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetch.mock.calls[1]?.[1].body).toBeUndefined();
  });

  it('ディレクトリの読み取りはパスとworkerを送り、結果をIDで読む', async () => {
    const fetch = stubJsonResponse({ id: 'listing' }, 201);
    const worker = { tokenId: 'token', workerId: 'gpu-worker' };
    await targetChecksApi.requestDirectoryListing('target', { path: '~/', worker });
    await targetChecksApi.directoryListing('target', 'listing');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/targets/target/directory-listings');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ path: '~/', worker });
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/targets/target/directory-listings/listing');
  });

  it('接続確認を頼めるworkerの一覧を読む', async () => {
    const fetch = stubJsonResponse({ items: [] });
    expect(await targetChecksApi.workers()).toEqual([]);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/targets/check-workers');
  });
});
