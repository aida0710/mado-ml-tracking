import type { ArtifactPresenceItem, JsonObject, Run, SyncBatchCounts } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { runColumns } from './runListProjection.js';

export interface SyncRunOwnership {
  id: string;
  projectId: string;
  createdBy: string;
  lifecycleStage: 'active' | 'deleted';
  hasJob: boolean;
}

/**
 * クライアントが決めた1つのRun IDへのPUTを直列にし、同時の最初の送信が2つともRunを見つけられずに
 * 主キーを取り合うことが無いようにする。結合テストはスキーマをまたいで1つのDBを共有するので、
 * スキーマもキーに含める。
 */
export async function lockSyncRunId(connection: Connection, runId: string): Promise<void> {
  await connection.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('run-sync:'||$1||':'||current_schema(),0))",
    [runId],
  );
}

/** IDをすべてのProjectで探す。クライアントが決めたIDは既存のどのRunともぶつかりうる。 */
export async function findSyncRunOwnership(
  connection: Connection,
  runId: string,
  options: { lock: boolean },
): Promise<SyncRunOwnership | undefined> {
  return first<SyncRunOwnership>(
    connection,
    `SELECT id,project_id,created_by,lifecycle_stage,
      EXISTS(SELECT 1 FROM jobs WHERE jobs.run_id=runs.id) AS has_job
    FROM runs WHERE id=$1 ${options.lock ? 'FOR UPDATE OF runs' : ''}`,
    [runId],
  );
}

/** syncしたRunはクライアントで既に動いていたので、クライアントの時刻で開始する。 */
export async function markSyncRunStarted(
  connection: Connection,
  run: { runId: string; startedAt: string; origin: string | null },
): Promise<Run> {
  return (await first<Run>(
    connection,
    `UPDATE runs SET status='running',started_at=$2,sync_origin=$3 WHERE id=$1 RETURNING ${runColumns}`,
    [run.runId, run.startedAt, run.origin],
  ))!;
}

interface SyncBatchCountsRow {
  metricCount: number;
  paramCount: number;
  tagCount: number;
  logCount: number;
}

function toSyncBatchCounts(row: SyncBatchCountsRow): SyncBatchCounts {
  return {
    metrics: row.metricCount,
    params: row.paramCount,
    tags: row.tagCount,
    logs: row.logCount,
  };
}

/**
 * バッチのIDを確保する。既に受け取っていればfalseを返す。ON CONFLICTは同じキーの同時の挿入が
 * コミットされるのを待つので、同時の2つの送信のうち反映されるのは1つだけ。
 */
export async function claimSyncBatch(
  connection: Connection,
  batch: {
    projectId: string;
    runId: string;
    batchId: string;
    sequence: number;
    counts: SyncBatchCounts;
  },
): Promise<boolean> {
  const inserted = await first(
    connection,
    `INSERT INTO run_sync_batches(run_id,batch_id,project_id,sequence,metric_count,param_count,tag_count,log_count)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (run_id,batch_id) DO NOTHING RETURNING batch_id`,
    [
      batch.runId,
      batch.batchId,
      batch.projectId,
      batch.sequence,
      batch.counts.metrics,
      batch.counts.params,
      batch.counts.tags,
      batch.counts.logs,
    ],
  );
  return inserted !== undefined;
}

/** Runを終わらせた状態を持つバッチに印を付け、終了をどの送信によるものかたどれるようにする。 */
export async function recordSyncBatchStatus(
  connection: Connection,
  batch: { runId: string; batchId: string; status: string },
): Promise<void> {
  await connection.query(
    'UPDATE run_sync_batches SET status_applied=$3 WHERE run_id=$1 AND batch_id=$2',
    [batch.runId, batch.batchId, batch.status],
  );
}

export async function findSyncBatchCounts(
  connection: Connection,
  batch: { runId: string; batchId: string },
): Promise<SyncBatchCounts> {
  const row = (await first<SyncBatchCountsRow>(
    connection,
    `SELECT metric_count,param_count,tag_count,log_count FROM run_sync_batches
    WHERE run_id=$1 AND batch_id=$2`,
    [batch.runId, batch.batchId],
  ))!;
  return toSyncBatchCounts(row);
}

/** 既に違う値で記録したキー。jsonbの等価比較は書式とキーの順序を無視する。 */
export async function findChangedParamKeys(
  connection: Connection,
  change: { runId: string; params: JsonObject },
): Promise<string[]> {
  const changed = await rows<{ key: string }>(
    connection,
    `SELECT incoming.key FROM runs, jsonb_each($2::jsonb) AS incoming(key,value)
    WHERE runs.id=$1 AND runs.parameters ? incoming.key AND runs.parameters->incoming.key <> incoming.value
    ORDER BY incoming.key`,
    [change.runId, JSON.stringify(change.params)],
  );
  return changed.map(({ key }) => key);
}

export async function mergeSyncRunRecords(
  connection: Connection,
  change: { runId: string; params: JsonObject; tags: Record<string, string> },
): Promise<void> {
  await connection.query(
    'UPDATE runs SET parameters=parameters||$2::jsonb,tags=tags||$3::jsonb WHERE id=$1',
    [change.runId, JSON.stringify(change.params), JSON.stringify(change.tags)],
  );
}

export async function markSyncRunEnded(
  connection: Connection,
  end: { runId: string; status: string; endedAt: string; error: string | null },
): Promise<Run> {
  return (await first<Run>(
    connection,
    `UPDATE runs SET status=$2,ended_at=$3,error=$4 WHERE id=$1 RETURNING ${runColumns}`,
    [end.runId, end.status, end.endedAt, end.error],
  ))!;
}

/**
 * 今のArtifact（RunのArtifactの一覧と同じく、そのパスへの最新のアップロード）が同じ内容のパス。
 * 同じdigestの古いアップロードは数えない。クライアントのファイルがRunの見せるものにならないため。
 */
export async function findPresentArtifactPaths(
  connection: Connection,
  check: { projectId: string; runId: string; items: ArtifactPresenceItem[] },
): Promise<string[]> {
  const present = await rows<{ path: string }>(
    connection,
    `SELECT current.path FROM (
      SELECT DISTINCT ON (path) path,sha256,size FROM artifacts
      WHERE project_id=$1 AND run_id=$2 AND path=ANY($3::text[]) AND deleted_at IS NULL
      ORDER BY path,created_at DESC,id DESC
    ) current
    JOIN jsonb_to_recordset($4::jsonb) AS item(path text,sha256 text,size bigint)
      ON item.path=current.path AND item.sha256=current.sha256 AND item.size=current.size
    GROUP BY current.path ORDER BY current.path`,
    [
      check.projectId,
      check.runId,
      check.items.map(({ path }) => path),
      JSON.stringify(check.items),
    ],
  );
  return present.map(({ path }) => path);
}
