import type { LogEntry, MetricPoint, RunLogList } from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { rows } from '../db/database.js';

export async function appendMetrics(
  connection: Connection,
  runId: string,
  metrics: MetricPoint[],
): Promise<void> {
  await connection.query(
    `INSERT INTO metrics(run_id,name,value,step,timestamp)
    SELECT $1,name,value,step,timestamp FROM jsonb_to_recordset($2::jsonb) AS point(name text,value double precision,step bigint,timestamp timestamptz)`,
    [runId, JSON.stringify(metrics)],
  );
  // 再接続の間は、届く順がstepの順と違うことがある。
  await connection.query(
    `UPDATE runs SET latest_metrics=COALESCE((SELECT jsonb_object_agg(name,value) FROM
    (SELECT DISTINCT ON(name) name,value FROM metrics WHERE run_id=$1 ORDER BY name,step DESC,timestamp DESC,value DESC,id DESC) latest),'{}'::jsonb) WHERE id=$1`,
    [runId],
  );
}

export async function appendLogs(
  connection: Connection,
  runId: string,
  entries: LogEntry[],
): Promise<void> {
  await connection.query(
    `INSERT INTO run_logs(run_id,timestamp,level,message)
    SELECT $1,timestamp,level,message FROM jsonb_to_recordset($2::jsonb) AS entry(timestamp timestamptz,level text,message text)`,
    [runId, JSON.stringify(entries)],
  );
}

export async function listMetrics(connection: Connection, runId: string): Promise<MetricPoint[]> {
  return rows(
    connection,
    'SELECT name,value,step::float8 AS step,timestamp FROM metrics WHERE run_id=$1 ORDER BY step,timestamp,id',
    [runId],
  );
}

export async function listLogs(connection: Connection, runId: string): Promise<LogEntry[]> {
  return rows(
    connection,
    'SELECT timestamp,level,message FROM run_logs WHERE run_id=$1 ORDER BY id',
    [runId],
  );
}

/**
 * Runの最新の`tail`行（古い順。logs_run(run_id,id)に沿って後ろから読む）と、Runの行数。
 * 1つのSQL文で両方を読むので、その間に書かれた行のせいで件数と行が食い違うことはない（画面は
 * 件数から行番号を付ける）。
 */
export async function listLatestLogs(
  connection: Connection,
  latest: { runId: string; tail: number },
): Promise<RunLogList> {
  // ログの無いRunでも、LEFT JOINによりログの列がnullの行が1つ残るので、件数は返る。保存された
  // ログの行には必ずtimestampがある。
  const found = await rows<(LogEntry | { timestamp: null }) & { totalCount: number }>(
    connection,
    `SELECT latest.timestamp,latest.level,latest.message,total.count AS total_count
    FROM (SELECT count(*)::int AS count FROM run_logs WHERE run_id=$1) total
    LEFT JOIN LATERAL (SELECT id,timestamp,level,message FROM run_logs WHERE run_id=$1
      ORDER BY id DESC LIMIT $2) latest ON true
    ORDER BY latest.id`,
    [latest.runId, latest.tail],
  );
  const items = found.flatMap((row) =>
    row.timestamp === null ? [] : [{ timestamp: row.timestamp, level: row.level, message: row.message }],
  );
  return { items, totalCount: found[0]!.totalCount };
}

/** ログの1行と、Runのログの中での位置。ログを少しずつ読むために使う。 */
export interface StoredLogEntry extends LogEntry {
  id: string;
}

/** 行`afterId`より後の行を最大`limit`行、古い順に返す（nullなら最初の行から）。 */
export async function listLogsAfter(
  connection: Connection,
  batch: { runId: string; afterId: string | null; limit: number },
): Promise<StoredLogEntry[]> {
  return rows(
    connection,
    // run_logs.idはbigintの列。選択リストでidと名付けたテキストではない。
    `SELECT id::text,timestamp,level,message FROM run_logs
    WHERE run_id=$1 AND ($2::bigint IS NULL OR run_logs.id>$2::bigint) ORDER BY run_logs.id LIMIT $3`,
    [batch.runId, batch.afterId, batch.limit],
  );
}
