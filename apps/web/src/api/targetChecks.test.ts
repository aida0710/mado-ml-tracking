import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TargetCheck, TargetDirectoryListing } from '@mmt/contracts';
import { targetChecksApi } from './targetChecks';

const createdAt = '2026-10-08T00:00:00.000Z';
const TARGET_ID = '00000000-0000-4000-8000-000000000001';
const worker = { tokenId: '00000000-0000-4000-8000-000000000002', workerId: 'gpu-worker' };
const queuedCheck: TargetCheck = {
  id: '00000000-0000-4000-8000-000000000003',
  targetId: TARGET_ID,
  requestedBy: '00000000-0000-4000-8000-000000000004',
  status: 'queued',
  workerId: null,
  assignedWorker: worker,
  result: null,
  failureReason: null,
  createdAt,
  claimedAt: null,
  finishedAt: null,
};
const queuedListing: TargetDirectoryListing = {
  id: '00000000-0000-4000-8000-000000000005',
  targetId: TARGET_ID,
  path: '~/',
  assignedWorker: worker,
  status: 'queued',
  workerId: null,
  result: null,
  failureReason: null,
  createdAt,
  finishedAt: null,
};

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
    const fetch = stubJsonResponse(queuedCheck, 201);
    await expect(targetChecksApi.request('target', worker)).resolves.toEqual(queuedCheck);
    await targetChecksApi.request('target');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/targets/target/checks');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ worker });
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetch.mock.calls[1]?.[1].body).toBeUndefined();
  });

  it('ディレクトリの読み取りはパスとworkerを送り、結果をIDで読む', async () => {
    const fetch = stubJsonResponse(queuedListing, 201);
    await expect(targetChecksApi.requestDirectoryListing('target', { path: '~/', worker })).resolves.toEqual(
      queuedListing,
    );
    await expect(targetChecksApi.directoryListing('target', 'listing')).resolves.toEqual(queuedListing);
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
