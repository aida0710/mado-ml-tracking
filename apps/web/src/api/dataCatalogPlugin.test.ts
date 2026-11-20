import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataCatalogPluginApi } from './dataCatalogPlugin';

afterEach(() => vi.unstubAllGlobals());

describe('mado S3 Data Catalogへの接続のAPI', () => {
  it('容量の取得に認証cookieと中断signalを渡し、空のprometheusも返す', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ prometheus: '' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(await dataCatalogPluginApi.capacity(controller.signal)).toBe('');
    expect(fetch).toHaveBeenCalledWith('/api/admin/plugins/data-catalog/capacity', {
      credentials: 'include', signal: controller.signal,
    });
  });

  it('容量の応答にprometheusがなければ、取得の成功として扱わない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(dataCatalogPluginApi.capacity()).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
