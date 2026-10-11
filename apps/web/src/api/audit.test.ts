import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditApi } from './audit';

afterEach(() => vi.unstubAllGlobals());
describe('Projectの監査ログ取得', () => {
  it('50件とcursorを指定し、次ページのcursorを返す', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [], nextCursor: 'older' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetch);
    const page = await auditApi.projectEvents('project', { cursor: 'last-event' });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/projects/project/audit-events?limit=50&cursor=last-event',
    );
    expect(page).toEqual({ items: [], nextCursor: 'older' });
  });
  it('全体の監査ログはProjectを付けないpathから同じ件数で読む', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await auditApi.globalEvents({ cursor: 'last-event' });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/audit-events?limit=50&cursor=last-event');
  });
  it('結果とログインを隠す条件はAPIへ渡し、続きのページも同じ条件で読む', async () => {
    // A Response body is read once, so each call gets its own.
    const fetch = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetch);
    await auditApi.globalEvents({
      cursor: 'last-event',
      filter: { outcome: 'denied', hideSignIns: true },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/audit-events?limit=50&outcome=denied&hideSignIns=true&cursor=last-event',
    );
    await auditApi.projectEvents('project', { filter: { hideSignIns: false } });
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/projects/project/audit-events?limit=50');
  });
  it('nextCursorが欠けた応答は最終ページとして扱わずエラーにする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 })),
    );
    await expect(auditApi.projectEvents('project')).rejects.toThrow();
  });
});
