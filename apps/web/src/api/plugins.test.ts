import type { DatasetVersion } from '@mmt/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pluginsApi } from './plugins';

afterEach(() => vi.unstubAllGlobals());

const importedVersion = {
  id: '00000000-0000-4000-8000-000000000001',
  datasetId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
  name: 'corpus',
  namespace: 'speech',
  version: 'v1',
  uri: 's3://bucket/corpus/v1',
  digest: 'sha256:abc',
  schema: {},
  metadata: {},
  sourceRunId: null,
  parentDatasetVersionIds: [],
  externalRef: null,
  contentKind: 'reference',
  fileCount: null,
  totalSize: null,
  createdAt: '2026-10-08T00:00:00.000Z',
} satisfies DatasetVersion;

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

  it('取り込みに固定バージョンIDと設定revisionを送りブラウザのデータ内容を送らない', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(importedVersion), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      pluginsApi.importDataset('project', 'plugin', { externalId: 'version-id', expectedRevision: 7 }),
    ).resolves.toEqual(importedVersion);
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
