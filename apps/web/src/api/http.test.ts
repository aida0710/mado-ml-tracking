import { ApiError } from '@mado/design-system/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchApiResponse } from './http';

afterEach(() => vi.unstubAllGlobals());
describe('本文をJSONとして読まない取得', () => {
  it('成功の応答をそのまま返し、cookieを付けて送る', async () => {
    const response = new Response('a,b\n', { status: 200 });
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetch);
    await expect(fetchApiResponse('/api/test', { method: 'POST' })).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledWith('/api/test', { credentials: 'include', method: 'POST' });
  });
  it('失敗の応答はAPIの文をmessageに持つApiErrorにする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'artifact not found', code: 'not_found', artifactId: 'a1' }), {
          status: 404,
        }),
      ),
    );
    const failure = await fetchApiResponse('/api/test').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      message: 'artifact not found',
      status: 404,
      code: 'not_found',
      details: { artifactId: 'a1' },
    });
  });
  it('APIの形でない本文の失敗はHTTPの状態を文にする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' })),
    );
    await expect(fetchApiResponse('/api/test')).rejects.toMatchObject({
      message: 'HTTP 502 Bad Gateway',
      status: 502,
      code: undefined,
    });
  });
  it('接続できないときはstatus 0の接続失敗のcodeにする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchApiResponse('/api/test')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });
  it('ブラウザの中断を接続障害に置き換えない', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(fetchApiResponse('/api/test')).rejects.toBe(abort);
  });
});
