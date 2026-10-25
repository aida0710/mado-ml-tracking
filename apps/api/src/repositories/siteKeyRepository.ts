import type { LauncherKey, SiteKey, SiteSettings } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';

const keyColumns =
  'id,target_id,user_id,launcher_id,status,public_key,fingerprint,requested_at,ready_at';

/** siteの有効な鍵。共用アカウントの鍵を先に並べる。 */
export async function listLiveSiteKeys(connection: Connection, targetId: string): Promise<SiteKey[]> {
  return rows<SiteKey>(
    connection,
    `SELECT ${keyColumns} FROM site_keys WHERE target_id=$1 AND revoked_at IS NULL
    ORDER BY user_id NULLS FIRST,requested_at`,
    [targetId],
  );
}

export async function findLiveSiteKey(
  connection: Connection,
  account: { targetId: string; userId: string | null },
): Promise<SiteKey | undefined> {
  return first<SiteKey>(
    connection,
    `SELECT ${keyColumns} FROM site_keys WHERE target_id=$1 AND user_id IS NOT DISTINCT FROM $2
    AND revoked_at IS NULL`,
    [account.targetId, account.userId],
  );
}

export async function revokeSiteKey(connection: Connection, keyId: string): Promise<void> {
  await connection.query('UPDATE site_keys SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL', [
    keyId,
  ]);
}

/** このアカウント用の新しい鍵をsiteのlauncherに依頼する。 */
export async function requestSiteKey(
  connection: Connection,
  key: { targetId: string; userId: string | null; launcherId: string },
): Promise<SiteKey> {
  return (await first<SiteKey>(
    connection,
    `INSERT INTO site_keys(target_id,user_id,launcher_id) VALUES($1,$2,$3) RETURNING ${keyColumns}`,
    [key.targetId, key.userId, key.launcherId],
  ))!;
}

/**
 * siteのlauncherがログインに使うアカウントごとに、有効な鍵を1つずつ保つ。対象は共用アカウントか、
 * 本人アカウントのsiteならアカウント名を設定した全員。別のlauncherの鍵や、siteがもう使わない
 * アカウントの鍵は失効させる。手動投入のsiteには鍵が無い。
 */
export async function reconcileSiteKeys(
  connection: Connection,
  site: { targetId: string; automatic: boolean; settings: Pick<SiteSettings, 'launcherId' | 'accountMode'> },
): Promise<void> {
  const launcherId = site.automatic ? site.settings.launcherId : null;
  let accounts: (string | null)[] = [];
  if (launcherId && site.settings.accountMode === 'shared') accounts = [null];
  if (launcherId && site.settings.accountMode === 'personal')
    accounts = (
      await rows<{ userId: string }>(
        connection,
        "SELECT user_id FROM site_personal_settings WHERE target_id=$1 AND account_name<>'' ORDER BY user_id",
        [site.targetId],
      )
    ).map((row) => row.userId);
  for (const key of await listLiveSiteKeys(connection, site.targetId))
    if (key.launcherId !== launcherId || !accounts.includes(key.userId))
      await revokeSiteKey(connection, key.id);
  if (!launcherId) return;
  const live = await listLiveSiteKeys(connection, site.targetId);
  for (const userId of accounts)
    if (!live.some((key) => key.userId === userId))
      await requestSiteKey(connection, { targetId: site.targetId, userId, launcherId });
}

/** launcherが持っている、または作るべき有効な鍵のすべて。 */
export async function listLauncherKeys(
  connection: Connection,
  launcherId: string,
): Promise<LauncherKey[]> {
  return rows<LauncherKey>(
    connection,
    `SELECT id,target_id,user_id,status,public_key FROM site_keys
    WHERE launcher_id=$1 AND revoked_at IS NULL ORDER BY requested_at,id`,
    [launcherId],
  );
}

/**
 * launcherが作った鍵の公開鍵を記録する。その鍵がlauncherの有効な鍵でなければundefined。
 */
export async function publishSiteKey(
  connection: Connection,
  key: { keyId: string; launcherId: string; publicKey: string; fingerprint: string },
): Promise<{ key: SiteKey; previousFingerprint: string | null } | undefined> {
  const current = await first<{ fingerprint: string | null }>(
    connection,
    'SELECT fingerprint FROM site_keys WHERE id=$1 AND launcher_id=$2 AND revoked_at IS NULL FOR UPDATE',
    [key.keyId, key.launcherId],
  );
  if (!current) return undefined;
  const published = (await first<SiteKey>(
    connection,
    `UPDATE site_keys SET status='ready',public_key=$2,fingerprint=$3,
      ready_at=CASE WHEN fingerprint IS NOT DISTINCT FROM $3 THEN ready_at ELSE now() END
    WHERE id=$1 RETURNING ${keyColumns}`,
    [key.keyId, key.publicKey, key.fingerprint],
  ))!;
  return { key: published, previousFingerprint: current.fingerprint };
}
