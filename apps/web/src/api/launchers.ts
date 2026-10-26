import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { LauncherCreate } from '@mmt/contracts';
import { itemsOf, launcherCreatedSchema, launcherSchema } from '@mmt/contracts/schemas';
import { z } from 'zod';
import { encodeId } from './http';

const launcherPath = (launcherId: string) => `/api/launchers/${encodeId(launcherId)}`;

// ランチャーは全体管理者が登録する。コンピュータのランチャーを選ぶため、ログインしている人なら
// 誰でも有効なランチャーを一覧できる。
export const launchersApi = {
  list: async (signal?: AbortSignal) =>
    (await requestJson('/api/launchers', { schema: itemsOf(launcherSchema), init: { signal } })).items,
  create: (body: LauncherCreate) =>
    requestJson('/api/launchers', { schema: launcherCreatedSchema, init: jsonRequestInit('POST', body) }),
  /** tokenを作り直す。古いtokenはすぐに使えなくなる。 */
  rotateToken: (launcherId: string) =>
    requestJson(`${launcherPath(launcherId)}/token`, { schema: launcherCreatedSchema, init: { method: 'POST' } }),
  /** ランチャーとそのtokenを失効させる。 */
  revoke: (launcherId: string) =>
    requestJson(launcherPath(launcherId), { schema: z.undefined(), init: { method: 'DELETE' } }),
};
