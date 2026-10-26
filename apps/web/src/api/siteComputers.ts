import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type {
  SiteConnectionCheckRequest,
  SiteJobShellCreate,
  SiteKeyRotate,
  SitePersonalSettingsInput,
} from '@mmt/contracts';
import {
  itemsOf,
  siteConnectionCheckSchema,
  siteJobShellSchema,
  siteJobShellSummarySchema,
  siteKeySchema,
  sitePersonalSettingsLookupSchema,
  sitePersonalSettingsSchema,
} from '@mmt/contracts/schemas';
import { z } from 'zod';
import { encodeId } from './http';

// siteがComputeTargetの項目のほかに持つもの。job shellのバージョン、siteを使う人の個人設定、
// ランチャーの鍵と接続確認。

const targetPath = (targetId: string) => `/api/targets/${encodeId(targetId)}`;
const jobShellsPath = (targetId: string) => `${targetPath(targetId)}/job-shells`;
const myPersonalSettingsPath = (targetId: string) =>
  `${targetPath(targetId)}/personal-settings/me`;

export const siteComputersApi = {
  /** job shellのバージョンを新しい順（先頭が今のバージョン）に返す。 */
  jobShells: async (targetId: string, signal?: AbortSignal) =>
    (await requestJson(jobShellsPath(targetId), { schema: itemsOf(siteJobShellSummarySchema), init: { signal } }))
      .items,
  jobShell: (targetId: string, jobShellId: string, signal?: AbortSignal) =>
    requestJson(`${jobShellsPath(targetId)}/${encodeId(jobShellId)}`, { schema: siteJobShellSchema, init: { signal } }),
  /** 以後の投入に使う次のバージョンを保存する。今と同じ内容なら今のバージョンを返す。 */
  createJobShell: (targetId: string, body: SiteJobShellCreate) =>
    requestJson(jobShellsPath(targetId), { schema: siteJobShellSchema, init: jsonRequestInit('POST', body) }),
  /** そのsiteの全員の設定。所有者と全体管理者だけ。 */
  personalSettings: async (targetId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${targetPath(targetId)}/personal-settings`, {
        schema: itemsOf(sitePersonalSettingsSchema),
        init: { signal },
      })
    ).items,
  /** そのsiteの自分の設定。保存するまではnull。 */
  myPersonalSettings: async (targetId: string, signal?: AbortSignal) =>
    (await requestJson(myPersonalSettingsPath(targetId), { schema: sitePersonalSettingsLookupSchema, init: { signal } }))
      .item,
  /** 本人のアカウントでログインするsiteでは、アカウントを保存するとランチャーに鍵の作成を頼む。 */
  saveMyPersonalSettings: (targetId: string, body: SitePersonalSettingsInput) =>
    requestJson(myPersonalSettingsPath(targetId), {
      schema: sitePersonalSettingsSchema,
      init: jsonRequestInit('PUT', body),
    }),
  /** 自分の設定を消し、自分の鍵を失効させる。 */
  deleteMyPersonalSettings: (targetId: string) =>
    requestJson(myPersonalSettingsPath(targetId), { schema: z.undefined(), init: { method: 'DELETE' } }),
  /** 失効していない鍵。所有者と全体管理者にはすべて、ほかの人には自分の鍵だけ。 */
  keys: async (targetId: string, signal?: AbortSignal) =>
    (await requestJson(`${targetPath(targetId)}/keys`, { schema: itemsOf(siteKeySchema), init: { signal } })).items,
  /** 共用（personal=false）か自分の鍵を失効させ、ランチャーに新しい鍵を頼む。 */
  rotateKey: (targetId: string, body: SiteKeyRotate) =>
    requestJson(`${targetPath(targetId)}/keys/rotate`, { schema: siteKeySchema, init: jsonRequestInit('POST', body) }),
  requestConnectionCheck: (targetId: string, body: SiteConnectionCheckRequest) =>
    requestJson(`${targetPath(targetId)}/connection-checks`, {
      schema: siteConnectionCheckSchema,
      init: jsonRequestInit('POST', body),
    }),
  /** 共用アカウント（personal=false）か自分のアカウントの、新しい接続確認。 */
  connectionChecks: async (targetId: string, personal: boolean, signal?: AbortSignal) =>
    (
      await requestJson(
        `${targetPath(targetId)}/connection-checks?${new URLSearchParams({ personal: String(personal) })}`,
        { schema: itemsOf(siteConnectionCheckSchema), init: { signal } },
      )
    ).items,
};
