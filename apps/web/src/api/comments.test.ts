import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Comment, RunNote } from '@mmt/contracts';
import { commentsApi } from './comments';
import { runNotesApi } from './runNotes';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const RUN_ID = '00000000-0000-4000-8000-000000000020';
const comment = {
  id: '00000000-0000-4000-8000-000000000021',
  projectId: '00000000-0000-4000-8000-000000000001',
  targetType: 'run',
  targetId: RUN_ID,
  parentCommentId: null,
  body: '再現しました',
  author: { id: '00000000-0000-4000-8000-000000000002', displayName: '検証担当' },
  createdAt: '2026-10-08T00:00:00.000Z',
  editedAt: null,
  deleted: false,
} satisfies Comment;

afterEach(() => vi.unstubAllGlobals());
describe('コメントAPI', () => {
  it('一覧は対象とページ件数を送り、2ページ目からcursorを付ける', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => jsonResponse({ items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetch);
    await commentsApi.list('p 1', { targetType: 'model_version', targetId: 'v/1' });
    await commentsApi.list('p 1', { targetType: 'run', targetId: 'r1' }, { cursor: 'c9' });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/projects/p%201/comments?targetType=model_version&targetId=v%2F1&limit=100',
    );
    expect(fetch.mock.calls[1]?.[0]).toBe(
      '/api/projects/p%201/comments?targetType=run&targetId=r1&limit=100&cursor=c9',
    );
  });

  it('nextCursorが欠けた一覧の応答はエラーにする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [] })));
    await expect(
      commentsApi.list('p', { targetType: 'run', targetId: 'r' }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('投稿はPOSTで対象・返信先・本文を送る', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(comment, 201));
    vi.stubGlobal('fetch', fetch);
    await commentsApi.create('p', {
      targetType: 'run',
      targetId: 'r1',
      parentCommentId: 'root',
      body: '再現しました',
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/p/comments');
    expect(fetch.mock.calls[0]?.[1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({
      targetType: 'run',
      targetId: 'r1',
      parentCommentId: 'root',
      body: '再現しました',
    });
  });

  it('編集はPATCHで本文だけを送り、削除はDELETEの204を成功として扱う', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...comment, body: '直しました', editedAt: comment.createdAt }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await commentsApi.update('p', 'c1', { body: '直しました' });
    await expect(commentsApi.remove('p', 'c1')).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/projects/p/comments/c1');
    expect(fetch.mock.calls[0]?.[1].method).toBe('PATCH');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ body: '直しました' });
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/projects/p/comments/c1');
    expect(fetch.mock.calls[1]?.[1].method).toBe('DELETE');
  });
});

describe('Runの説明文API', () => {
  it('PUT /runs/:r/note に説明文を送る', async () => {
    const note = { runId: RUN_ID, content: '# 結果' } satisfies RunNote;
    const fetch = vi.fn().mockResolvedValue(jsonResponse(note));
    vi.stubGlobal('fetch', fetch);
    expect(await runNotesApi.update('p', RUN_ID, { content: '# 結果' })).toEqual(note);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/projects/p/runs/${RUN_ID}/note`);
    expect(fetch.mock.calls[0]?.[1].method).toBe('PUT');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({ content: '# 結果' });
  });
});
