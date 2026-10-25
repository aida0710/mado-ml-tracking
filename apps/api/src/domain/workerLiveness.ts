// 生存はデータベースの時計で判定し、時計がずれたAPIのホストどうしでも結果がそろうようにする。

// workerはJobのheartbeatを5秒ごとに送る。12回続けて届かなければJobをstaleとみなす。
export const JOB_HEARTBEAT_STALE_SECONDS = 60;
// 待機中のworkerはおよそ1秒に1回claimするので、2分間何も届かなければプロセスはもう無い。
export const WORKER_OFFLINE_SECONDS = 120;
// claimは毎秒届く。claimのたびに行を書かないよう、presenceの更新はそれより間隔を空ける。
export const WORKER_PRESENCE_WRITE_INTERVAL_SECONDS = 15;

function qualified(alias: string, column: string): string {
  return alias ? `${alias}.${column}` : column;
}

// 投入待ちやスケジューラのキューにいるsiteのJobにはまだrunnerが無いので、heartbeatも無い。
const PHASES_WITHOUT_HEARTBEAT = ['waiting_manual', 'submitting', 'submitted'];

// staleは報告するだけ。Jobを失敗にしたり、キューに戻したり、GPUから解放したりはしない。
// 黙っているworkerがまだプロセスを動かしているかもしれないため（docs/worker.md）。
export function jobHeartbeatStaleSql(alias = ''): string {
  const waitingPhases = PHASES_WITHOUT_HEARTBEAT.map((phase) => `'${phase}'`).join(',');
  return `(${qualified(alias, 'status')} IN ('claimed','running') AND ${qualified(alias, 'heartbeat_at')} < now() - interval '${JOB_HEARTBEAT_STALE_SECONDS} seconds'
    AND (${qualified(alias, 'phase')} IS NULL OR ${qualified(alias, 'phase')} NOT IN (${waitingPhases})))`;
}

export function workerOfflineSql(alias = ''): string {
  return `(${qualified(alias, 'last_seen_at')} < now() - interval '${WORKER_OFFLINE_SECONDS} seconds')`;
}

export function workerPresenceStatusSql(alias = ''): string {
  return `(CASE WHEN ${workerOfflineSql(alias)} THEN 'offline' ELSE 'online' END)`;
}

export function workerPresenceWriteDueSql(alias = ''): string {
  return `(${qualified(alias, 'last_seen_at')} < now() - interval '${WORKER_PRESENCE_WRITE_INTERVAL_SECONDS} seconds')`;
}
