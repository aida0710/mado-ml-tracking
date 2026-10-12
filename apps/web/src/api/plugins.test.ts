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
    await expect(pluginsApi.metrics('project', 'plugin')).rejects.toThrow();
  });

  it('取り込みに固定バージョンIDと設定revisionを送りブラウザのデータ内容を送らない', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await pluginsApi.importDataset('project', 'plugin', { externalId: 'version-id', expectedRevision: 7 });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/plugins/plugin/datasets/import');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ externalId: 'version-id', expectedRevision: 7 });
  });

  it('一般利用者の表示用状態は管理者の接続一覧とは別のAPIから取得する', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"items":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(await pluginsApi.availability('project', controller.signal)).toEqual([]);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/project/plugins/availability');
    expect(fetch.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });
});
