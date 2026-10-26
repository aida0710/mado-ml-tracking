import { ApiError } from '@mado/design-system/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthMe } from '@mmt/contracts';
import { authApi } from './auth';
import { formatErrorMessage } from '../lib/errorMessage';
import { text } from '../i18n/catalog';

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status }),
    );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function failure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to fail');
}

describe('authApi.localLogin', () => {
  it('cookieを受け取れるようにcredentials付きでJSONを送り、AuthMeを返す', async () => {
    const me = {
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'admin@example.invalid',
        displayName: '管理者',
        isAdmin: true,
        username: 'admin',
        status: 'active',
        authSources: ['local'],
        kind: 'human',
      },
      mustChangePassword: true,
    } satisfies AuthMe;
    const fetch = respond(200, me);
    expect(await authApi.localLogin({ username: 'admin', password: 'secret value' })).toEqual(me);
    expect(fetch).toHaveBeenCalledWith('/api/auth/local-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret value' }),
      credentials: 'include',
    });
  });

  it('認証情報の誤りと回数の上限は、APIの文をそのまま出す', async () => {
    respond(401, { error: 'incorrect username or password', code: 'invalid_credentials' });
    const invalid = await failure(() => authApi.localLogin({ username: 'a', password: 'b' }));
    expect(invalid).toBeInstanceOf(ApiError);
    expect(formatErrorMessage(invalid)).toBe('incorrect username or password');
    respond(429, { error: 'too many attempts; wait and try again', code: 'rate_limited' });
    const limited = await failure(() => authApi.localLogin({ username: 'a', password: 'b' }));
    expect(formatErrorMessage(limited)).toBe('too many attempts; wait and try again');
  });

  it('通信できないときは、ほかの画面と同じ表示言語の文にする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const offline = await failure(() => authApi.localLogin({ username: 'a', password: 'b' }));
    expect(offline).toBeInstanceOf(ApiError);
    expect(formatErrorMessage(offline)).toBe(text.requestError);
  });
});

describe('authApi.changePassword', () => {
  it('204を成功として扱う', async () => {
    const fetch = respond(204, null);
    await expect(
      authApi.changePassword({ currentPassword: 'old value', newPassword: 'new value' }),
    ).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![0]).toBe('/api/auth/change-password');
  });

  it('断られた理由は、APIの文とcodeを持つApiErrorで返す', async () => {
    respond(400, { error: 'current password is incorrect', code: 'incorrect_password' });
    const error = await failure(() =>
      authApi.changePassword({ currentPassword: 'old value', newPassword: 'new value' }),
    );
    expect(error).toMatchObject({ status: 400, code: 'incorrect_password' });
    expect(formatErrorMessage(error)).toBe('current password is incorrect');
  });
});
