import { afterEach, describe, expect, it, vi } from 'vitest';
import { automationApi } from './automation';

afterEach(() => vi.unstubAllGlobals());
describe('自動実行API', () => {
  it('有効無効のPATCHにはenabledだけを送り不変の設定を変更しない', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'rule', enabled: false })));
    vi.stubGlobal('fetch', fetch);
    await automationApi.setRuleEnabled('project', 'rule', false);
    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/project/automation-rules/rule',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      }),
    );
  });
  it('失敗した切替を成功扱いにせずエラーを返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'Admin required' }), { status: 403 }),
        ),
    );
    await expect(automationApi.setRuleEnabled('project', 'rule', true)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('実行履歴は件数・ルール・バージョン・続きの位置をクエリに入れて読む', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null })));
    vi.stubGlobal('fetch', fetch);
    await automationApi.executionPage('project', {
      filter: { ruleId: 'rule', modelVersionId: 'version' },
      limit: 100,
      cursor: 'execution-100',
    });
    const [url] = fetch.mock.calls[0] as [string];
    const query = new URL(url, 'http://localhost').searchParams;
    expect(Object.fromEntries(query)).toEqual({
      limit: '100',
      ruleId: 'rule',
      modelVersionId: 'version',
      cursor: 'execution-100',
    });
  });
  it('絞り込みの無い最初のページは件数だけを送る', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null })));
    vi.stubGlobal('fetch', fetch);
    await automationApi.executionPage('project', { limit: 100 });
    expect(fetch.mock.calls[0]![0]).toBe('/api/projects/project/automation-executions?limit=100');
  });
});
