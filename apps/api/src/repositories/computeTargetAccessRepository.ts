import type { ComputeTargetOverview } from '@mmt/contracts';
import { rows, type Connection } from '../db/database.js';

/**
 * コンピュータで誰のJobを動かせるかを、compute_targets `t`に対するSQLで表す。公開のものでは全員の
 * Job、非公開のものでは所有者と、所有者が作ったService AccountのJob。$userはJobを動かす名義
 * （Runの作成者、またはルール・フック・Task・Sweepの所有者）。
 */
export function targetUsableSql(user: string): string {
  return `(t.visibility='public' OR t.owner_user_id=${user} OR EXISTS(
    SELECT 1 FROM service_account_details sa WHERE sa.user_id=${user} AND sa.created_by=t.owner_user_id))`;
}

/** 呼び出し元が管理できるか（サービスが決める）を付ける前の概要の行。 */
export type TargetOverviewRow = Omit<ComputeTargetOverview, 'canManage' | 'launcher'> & {
  launcherName: string | null;
  launcherLastSeenAt: string | null;
  launcherRevokedAt: string | null;
};

/**
 * すべてのコンピュータと、`userId`がそこでJobを動かせるか、自動のsiteならそのJobを投入する
 * launcher。コンピュータへの接続方法を示す列は無い。
 */
export async function listTargetOverviewRows(
  connection: Connection,
  userId: string,
): Promise<TargetOverviewRow[]> {
  return rows<TargetOverviewRow>(
    connection,
    `SELECT t.id,t.name,t.executor,t.submission_mode,t.cpu_arch,t.supports_array,t.enabled,
      t.visibility,t.owner_user_id,o.display_name AS owner_name,${targetUsableSql('$1::uuid')} AS usable,
      l.name AS launcher_name,l.last_seen_at AS launcher_last_seen_at,l.revoked_at AS launcher_revoked_at
    FROM compute_targets t LEFT JOIN users o ON o.id=t.owner_user_id
    LEFT JOIN site_settings s ON s.target_id=t.id AND t.executor='site' AND t.submission_mode='automatic'
    LEFT JOIN launchers l ON l.id=s.launcher_id
    ORDER BY t.name,t.id`,
    [userId],
  );
}
