import type { Launcher, LauncherCreate, LauncherCreated } from '@mmt/contracts';
import { encodeId, invalidResponseError, jsonRequest, request, requestItems } from './http';

const launcherPath = (launcherId: string) => `/launchers/${encodeId(launcherId)}`;

/** ランチャーの新しいtoken。一度しか見せないので、tokenの無い応答は契約違反とする。 */
async function issueToken(path: string, init: RequestInit): Promise<LauncherCreated> {
  const created = await request<LauncherCreated>(path, init);
  if (typeof created.token !== 'string' || typeof created.launcher?.id !== 'string')
    throw invalidResponseError(201);
  return created;
}

// ランチャーは全体管理者が登録する。コンピュータのランチャーを選ぶため、ログインしている人なら
// 誰でも有効なランチャーを一覧できる。
export const launchersApi = {
  list: (signal?: AbortSignal) => requestItems<Launcher>('/launchers', signal),
  create: (body: LauncherCreate) => issueToken('/launchers', jsonRequest('POST', body)),
  /** tokenを作り直す。古いtokenはすぐに使えなくなる。 */
  rotateToken: (launcherId: string) =>
    issueToken(`${launcherPath(launcherId)}/token`, { method: 'POST' }),
  /** ランチャーとそのtokenを失効させる。 */
  revoke: (launcherId: string) => request<void>(launcherPath(launcherId), { method: 'DELETE' }),
};
