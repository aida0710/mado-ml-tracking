import type { TargetCheckWorker, TargetCheckWorkerPresence } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { workerOfflineSql } from '../domain/workerLiveness.js';

// workerのホストはsiteごとに1、2台で、ダイアログはそれを1つのドロップダウンに並べる。
const MAX_CHECK_WORKERS = 100;

// オンラインで、SSHのファイルを報告していて（つまり割り当てられたものをclaimする）、まだ有効な
// tokenを持っている。これがコンピュータの確認を頼めるworkerの条件。
const checkWorkerConditionSql = `NOT ${workerOfflineSql('w')}
  AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())`;

const CHECK_WORKER_COLUMNS = `w.token_id,t.name AS token_name,w.project_id,w.worker_id,w.hostname,
  w.version,w.last_seen_at,w.ssh_files`;

export async function listCheckWorkers(connection: Connection): Promise<TargetCheckWorkerPresence[]> {
  return rows<TargetCheckWorkerPresence>(
    connection,
    `SELECT ${CHECK_WORKER_COLUMNS} FROM workers w JOIN api_tokens t ON t.id=w.token_id
    WHERE ${checkWorkerConditionSql}
    ORDER BY w.last_seen_at DESC,w.token_id,w.worker_id LIMIT ${MAX_CHECK_WORKERS}`,
  );
}

export async function isCheckWorker(
  connection: Connection,
  worker: TargetCheckWorker,
): Promise<boolean> {
  return Boolean(
    await first<{ found: boolean }>(
      connection,
      `SELECT true AS found FROM workers w JOIN api_tokens t ON t.id=w.token_id
      WHERE w.token_id=$1 AND w.worker_id=$2 AND ${checkWorkerConditionSql}`,
      [worker.tokenId, worker.workerId],
    ),
  );
}
