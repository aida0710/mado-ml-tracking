import { afterEach, describe, expect, it, vi } from 'vitest';
import { pluginsApi } from './plugins';

afterEach(() => vi.unstubAllGlobals());

describe('Mado連携API', () => {
  it('容量取得に認証cookieと中断signalを渡し空のprometheusも返す', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ prometheus: '' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(await pluginsApi.metrics('project', 'plugin', controller.signal)).toBe('');
    expect(fetch).toHaveBeenCalledWith('/api/projects/project/plugins/plugin/metrics', {
      credentials: 'include', signal: controller.signal,
    });
  });

  it('容量応答にprometheusがなければ取得成功として扱わない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(pluginsApi.metrics('project', 'plugin')).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
