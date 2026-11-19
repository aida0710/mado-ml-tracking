import type {
  OperationsAlert,
  OperationsAlertKind,
  OperationsAlertResolution,
  OperationsAlertState,
  RunKind,
} from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import type { OpenAlertReference, OperationsAlertDetail } from '../domain/operationsAlerts.js';

const ALERT_COLUMNS = 'id,project_id,kind,subject_id,opened_at,resolved_at,resolution,detail';
// 同じ列を別名`a`を通して読む形。Projectを結合するクエリに使う。
const ALERT_COLUMNS_OF_A = ALERT_COLUMNS.split(',')
  .map((column) => `a.${column}`)
  .join(',');

/** claimedかrunningのJobと、DBの時計で測ったそのheartbeatからの経過時間。 */
export interface ActiveJobHeartbeat {
  jobId: string;
  projectId: string;
  runId: string;
  runName: string;
  runKind: RunKind;
  experimentId: string;
  workerId: string | null;
  heartbeatAt: string | null;
  heartbeatAgeSeconds: number;
}

/** tokenがまだ認証に使えるworkerと、DBの時計で測った無応答の時間。 */
export interface WorkerSilence {
  projectId: string;
  tokenId: string;
  tokenName: string;
  workerId: string;
  hostname: string | null;
  lastSeenAt: string;
  silentSeconds: number;
  activeJobCount: number;
}

export async function listOpenAlerts(connection: Connection): Promise<OpenAlertReference[]> {
  return rows<OpenAlertReference>(
    connection,
    'SELECT id,kind,subject_id FROM operations_alerts WHERE resolved_at IS NULL',
  );
}

/** 対象に既に未解決のアラートがあればundefinedを返す。 */
export async function insertOpenAlert(
  connection: Connection,
  alert: {
    projectId: string;
    kind: OperationsAlertKind;
    subjectId: string;
    detail: OperationsAlertDetail;
  },
): Promise<OperationsAlert | undefined> {
  return first<OperationsAlert>(
    connection,
    `INSERT INTO operations_alerts(project_id,kind,subject_id,detail) VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT (kind,subject_id) WHERE resolved_at IS NULL DO NOTHING RETURNING ${ALERT_COLUMNS}`,
    [alert.projectId, alert.kind, alert.subjectId, JSON.stringify(alert.detail)],
  );
}

/** アラートが既に解決済みならundefinedを返す。 */
export async function resolveAlert(
  connection: Connection,
  request: { alertId: string; resolution: OperationsAlertResolution },
): Promise<OperationsAlert | undefined> {
  return first<OperationsAlert>(
    connection,
    `UPDATE operations_alerts SET resolved_at=now(),resolution=$2
    WHERE id=$1 AND resolved_at IS NULL RETURNING ${ALERT_COLUMNS}`,
    [request.alertId, request.resolution],
  );
}

/** 新しい順。stateが'open'なら未解決のアラートだけを並べる。 */
export async function listProjectAlerts(
  connection: Connection,
  filter: { projectId: string; state: OperationsAlertState; limit: number },
): Promise<OperationsAlert[]> {
  return rows<OperationsAlert>(
    connection,
    `SELECT ${ALERT_COLUMNS} FROM operations_alerts
    WHERE project_id=$1 AND ($2::boolean OR resolved_at IS NULL)
    ORDER BY opened_at DESC,id DESC LIMIT $3`,
    [filter.projectId, filter.state === 'all', filter.limit],
  );
}

/**
 * 利用者がメンバーである（直接の付与かグループの割り当て）アーカイブされていないProjectすべての
 * アラートを新しい順に返す。`seesEveryProject`（全体管理者のsession）なら、アーカイブされて
 * いないすべてのProjectのアラート。公開による閲覧は数えない。公開のProjectは誰でも開けるので、
 * 数えるとその止まったworkerが全員の通知ベルを鳴らしてしまう。`onlyProjectId`は、Projectに
 * 限定したtokenをそのProjectの中にとどめる。
 */
export async function listVisibleAlerts(
  connection: Connection,
  filter: {
    userId: string;
    seesEveryProject: boolean;
    onlyProjectId: string | null;
    state: OperationsAlertState;
    limit: number;
  },
): Promise<OperationsAlert[]> {
  return rows<OperationsAlert>(
    connection,
    `SELECT ${ALERT_COLUMNS_OF_A} FROM operations_alerts a
    JOIN projects p ON p.id=a.project_id AND p.archived_at IS NULL
    WHERE ($1 OR EXISTS (SELECT 1 FROM project_membership_roles m
      WHERE m.project_id=a.project_id AND m.user_id=$2))
    AND ($3::uuid IS NULL OR a.project_id=$3) AND ($4::boolean OR a.resolved_at IS NULL)
    ORDER BY a.opened_at DESC,a.id DESC LIMIT $5`,
    [
      filter.seesEveryProject,
      filter.userId,
      filter.onlyProjectId,
      filter.state === 'all',
      filter.limit,
    ],
  );
}

export async function listActiveJobHeartbeats(
  connection: Connection,
): Promise<ActiveJobHeartbeat[]> {
  return rows<ActiveJobHeartbeat>(
    connection,
    `SELECT j.id AS job_id,j.project_id,j.run_id,r.name AS run_name,r.kind AS run_kind,
      r.experiment_id,j.worker_id,j.heartbeat_at,
      extract(epoch FROM now()-j.heartbeat_at)::float8
        AS heartbeat_age_seconds
    FROM jobs j JOIN runs r ON r.id=j.run_id
    WHERE j.status IN ('claimed','running')`,
  );
}

// 失効したか期限切れのtokenのworkerは、同じ身元で戻ってこられないので見張らない。
export async function listWorkerSilences(connection: Connection): Promise<WorkerSilence[]> {
  return rows<WorkerSilence>(
    connection,
    `SELECT w.project_id,w.token_id,t.name AS token_name,w.worker_id,w.hostname,w.last_seen_at,
      extract(epoch FROM now()-w.last_seen_at)::float8 AS silent_seconds,
      (SELECT count(*)::int FROM jobs j WHERE j.worker_token_id=w.token_id AND j.worker_id=w.worker_id
        AND j.status IN ('claimed','running')) AS active_job_count
    FROM workers w JOIN api_tokens t ON t.id=w.token_id
    WHERE t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>now())`,
  );
}
