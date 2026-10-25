import type {
  SiteConnectionCheck,
  SiteConnectionCheckRequest,
  SiteJobShell,
  SiteJobShellCreate,
  SiteJobShellSummary,
  SiteKey,
  SiteKeyRotate,
  SitePersonalSettings,
  SitePersonalSettingsInput,
  SitePersonalSettingsLookup,
} from '@mmt/contracts';
import { encodeId, invalidResponseError, jsonRequest, request, requestItems } from './http';

// siteがComputeTargetの項目のほかに持つもの。job shellのバージョン、siteを使う人の個人設定、
// ランチャーの鍵と接続確認。

const targetPath = (targetId: string) => `/targets/${encodeId(targetId)}`;
const jobShellsPath = (targetId: string) => `${targetPath(targetId)}/job-shells`;
const myPersonalSettingsPath = (targetId: string) =>
  `${targetPath(targetId)}/personal-settings/me`;

/** そのsiteの自分の設定。保存するまではnull。 */
async function myPersonalSettings(
  targetId: string,
  signal?: AbortSignal,
): Promise<SitePersonalSettings | null> {
  const lookup = await request<SitePersonalSettingsLookup>(myPersonalSettingsPath(targetId), {
    signal,
  });
  // `item: null`は「まだ保存していない」を表す。itemが無い応答も同じに読めてしまうので拒む。
  if (lookup.item === undefined) throw invalidResponseError();
  return lookup.item;
}

export const siteComputersApi = {
  /** job shellのバージョンを新しい順（先頭が今のバージョン）に返す。 */
  jobShells: (targetId: string, signal?: AbortSignal) =>
    requestItems<SiteJobShellSummary>(jobShellsPath(targetId), signal),
  jobShell: (targetId: string, jobShellId: string, signal?: AbortSignal) =>
    request<SiteJobShell>(`${jobShellsPath(targetId)}/${encodeId(jobShellId)}`, { signal }),
  /** 以後の投入に使う次のバージョンを保存する。今と同じ内容なら今のバージョンを返す。 */
  createJobShell: (targetId: string, body: SiteJobShellCreate) =>
    request<SiteJobShell>(jobShellsPath(targetId), jsonRequest('POST', body)),
  /** そのsiteの全員の設定。所有者と全体管理者だけ。 */
  personalSettings: (targetId: string, signal?: AbortSignal) =>
    requestItems<SitePersonalSettings>(`${targetPath(targetId)}/personal-settings`, signal),
  myPersonalSettings,
  /** 本人のアカウントでログインするsiteでは、アカウントを保存するとランチャーに鍵の作成を頼む。 */
  saveMyPersonalSettings: (targetId: string, body: SitePersonalSettingsInput) =>
    request<SitePersonalSettings>(myPersonalSettingsPath(targetId), jsonRequest('PUT', body)),
  /** 自分の設定を消し、自分の鍵を失効させる。 */
  deleteMyPersonalSettings: (targetId: string) =>
    request<void>(myPersonalSettingsPath(targetId), { method: 'DELETE' }),
  /** 失効していない鍵。所有者と全体管理者にはすべて、ほかの人には自分の鍵だけ。 */
  keys: (targetId: string, signal?: AbortSignal) =>
    requestItems<SiteKey>(`${targetPath(targetId)}/keys`, signal),
  /** 共用（personal=false）か自分の鍵を失効させ、ランチャーに新しい鍵を頼む。 */
  rotateKey: (targetId: string, body: SiteKeyRotate) =>
    request<SiteKey>(`${targetPath(targetId)}/keys/rotate`, jsonRequest('POST', body)),
  requestConnectionCheck: (targetId: string, body: SiteConnectionCheckRequest) =>
    request<SiteConnectionCheck>(
      `${targetPath(targetId)}/connection-checks`,
      jsonRequest('POST', body),
    ),
  /** 共用アカウント（personal=false）か自分のアカウントの、新しい接続確認。 */
  connectionChecks: (targetId: string, personal: boolean, signal?: AbortSignal) =>
    requestItems<SiteConnectionCheck>(
      `${targetPath(targetId)}/connection-checks?${new URLSearchParams({ personal: String(personal) })}`,
      signal,
    ),
};
