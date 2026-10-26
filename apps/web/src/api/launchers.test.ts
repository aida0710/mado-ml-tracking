import type { Launcher, LauncherCreated } from '@mmt/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchersApi } from './launchers';

afterEach(() => vi.unstubAllGlobals());
function stubJsonResponse(body: unknown, status = 200) {
  // Responseの本文は1回しか読めないので、呼ぶたびに別のResponseを作る。
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const launcher = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'main',
  createdBy: '00000000-0000-4000-8000-000000000002',
  createdAt: '2026-10-08T00:00:00.000Z',
  lastSeenAt: null,
  revokedAt: null,
  tokenPrefix: 'mado_mt_sec',
} satisfies Launcher;
const created = { launcher, token: 'mado_mt_secret' } satisfies LauncherCreated;

describe('launcherのAPI呼び出し', () => {
  it('一覧はlaunchersを読み、itemsの無い応答を拒否する', async () => {
    const fetch = stubJsonResponse({ items: [launcher] });
    await expect(launchersApi.list()).resolves.toEqual([launcher]);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/launchers');
    stubJsonResponse({});
    await expect(launchersApi.list()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('登録は名前をPOSTし、一度だけ返るtokenを返す', async () => {
    const fetch = stubJsonResponse(created, 201);
    await expect(launchersApi.create({ name: 'main' })).resolves.toEqual(created);
    expect(fetch.mock.calls[0]?.[1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body as string)).toEqual({ name: 'main' });
  });

  it('tokenかlauncherの無い応答は、tokenを見せられないので契約違反にする', async () => {
    stubJsonResponse({ launcher }, 201);
    await expect(launchersApi.create({ name: 'main' })).rejects.toMatchObject({ code: 'invalid_response' });
    stubJsonResponse({ token: 'mado_mt_secret' }, 201);
    await expect(launchersApi.rotateToken('launcher')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('名前の重複をcodeつきで返す', async () => {
    stubJsonResponse({ error: '同じ名前のlauncherがあります', code: 'launcher_name_taken' }, 409);
    await expect(launchersApi.create({ name: 'main' })).rejects.toMatchObject({
      status: 409,
      code: 'launcher_name_taken',
      message: '同じ名前のlauncherがあります',
    });
  });

  it('tokenの作り直しはPOST、失効はDELETE（204）でlauncherのIDを使う', async () => {
    const fetch = stubJsonResponse(created, 201);
    await expect(launchersApi.rotateToken('launcher/1')).resolves.toEqual(created);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/launchers/launcher%2F1/token');
    expect(fetch.mock.calls[0]?.[1].method).toBe('POST');
    const revoked = stubJsonResponse(null, 204);
    await expect(launchersApi.revoke('launcher/1')).resolves.toBeUndefined();
    expect(revoked.mock.calls[0]?.[0]).toBe('/api/launchers/launcher%2F1');
    expect(revoked.mock.calls[0]?.[1].method).toBe('DELETE');
  });
});
