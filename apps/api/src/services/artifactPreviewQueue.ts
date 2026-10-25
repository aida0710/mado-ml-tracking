import type { Artifact, ArtifactPreviewKind } from '@mmt/contracts';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';

// これより古いclaimは止まったworkerのものとみなす。処理全体（ダウンロード、調査、デコード、
// ポスター）は、ツールのタイムアウト（MMT_PREVIEW_TOOL_TIMEOUT_MS、既定は各30分）の
// 数回分に収まる。
export const PREVIEW_LEASE_SECONDS = 2 * 60 * 60;
// 保存先の一時的な不調やworkerの異常終了は再試行する。ffmpegが読めないファイルはすぐ失敗にする。
export const PREVIEW_MAX_ATTEMPTS = 3;

/**
 * 1つのArtifactの未完了のプレビュー。ファイルのダウンロードが1回で済むよう、まとめてclaimする。
 */
export interface PreviewJob {
  artifact: Artifact;
  /** 種類ごとの、このclaim後のattempts。種類を終えるときは同じ値でなければならない。 */
  attempts: Map<ArtifactPreviewKind, number>;
}

export interface PreviewOutcome {
  artifactId: string;
  kind: ArtifactPreviewKind;
  attempts: number;
}

/** queued、またはlease（$1秒）の切れたworkerがclaimしたもの。 */
function claimableCondition(table: string): string {
  return `(${table}.status='queued' OR (${table}.status='running' AND ${table}.updated_at < now() - make_interval(secs => $1)))`;
}

/** workerが何度も止まったプレビューは、いつまでも繰り返さないよう諦める。 */
async function failExhaustedClaims(database: Database): Promise<void> {
  await database.query(
    `UPDATE artifact_previews SET status='failed',error='lease_expired',updated_at=now()
     WHERE status='running' AND updated_at < now() - make_interval(secs => $1) AND attempts >= $2`,
    [PREVIEW_LEASE_SECONDS, PREVIEW_MAX_ATTEMPTS],
  );
}

export async function claimNextPreviewJob(database: Database): Promise<PreviewJob | null> {
  await failExhaustedClaims(database);
  return transaction(database, async (connection) => {
    // SKIP LOCKEDで、複数のworkerが別々のArtifactをclaimできる。外側のWHEREはロックのあとで
    // 確かめ直すので、その間に別のworkerがclaimした行を二重にclaimしない。
    const claimed = await rows<{ artifactId: string; kind: ArtifactPreviewKind; attempts: number }>(
      connection,
      `WITH target AS (
         SELECT artifact_id FROM artifact_previews candidate WHERE ${claimableCondition('candidate')}
         ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       UPDATE artifact_previews p
       SET status='running',attempts=p.attempts+1,error=NULL,updated_at=now()
       FROM target WHERE p.artifact_id=target.artifact_id AND ${claimableCondition('p')}
       RETURNING p.artifact_id,p.kind,p.attempts`,
      [PREVIEW_LEASE_SECONDS],
    );
    if (claimed.length === 0) return null;
    const artifact = (await first<Artifact>(connection, 'SELECT * FROM artifacts WHERE id=$1', [
      claimed[0]!.artifactId,
    ]))!;
    return {
      artifact,
      attempts: new Map(claimed.map((row) => [row.kind, row.attempts])),
    };
  });
}

/** claimを失った（leaseが切れて別のworkerが引き継いだ）ときはfalse。 */
export async function markPreviewReady(
  connection: Connection,
  outcome: PreviewOutcome & { previewArtifactId: string },
): Promise<boolean> {
  const result = await connection.query(
    `UPDATE artifact_previews SET status='ready',preview_artifact_id=$4,error=NULL,updated_at=now()
     WHERE artifact_id=$1 AND kind=$2 AND attempts=$3 AND status='running'`,
    [outcome.artifactId, outcome.kind, outcome.attempts, outcome.previewArtifactId],
  );
  return result.rowCount === 1;
}

export async function markPreviewFinished(
  database: Database,
  outcome: PreviewOutcome & { status: 'failed' | 'skipped'; error: string },
): Promise<void> {
  await database.query(
    `UPDATE artifact_previews SET status=$4,error=$5,updated_at=now()
     WHERE artifact_id=$1 AND kind=$2 AND attempts=$3 AND status='running'`,
    [outcome.artifactId, outcome.kind, outcome.attempts, outcome.status, outcome.error],
  );
}

/** 一時的な失敗のあとプレビューをキューに戻す。最後の試行だったら失敗にする。 */
export async function retryPreviewLater(
  database: Database,
  outcome: PreviewOutcome & { error: string },
): Promise<void> {
  await database.query(
    `UPDATE artifact_previews
     SET status=CASE WHEN attempts >= $4 THEN 'failed' ELSE 'queued' END,error=$5,updated_at=now()
     WHERE artifact_id=$1 AND kind=$2 AND attempts=$3 AND status='running'`,
    [outcome.artifactId, outcome.kind, outcome.attempts, PREVIEW_MAX_ATTEMPTS, outcome.error],
  );
}
