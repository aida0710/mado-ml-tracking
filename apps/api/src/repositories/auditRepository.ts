import type { AuditActorType, AuditEvent, AuditOutcome, JsonObject } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';

export interface AuditEventInput {
  actorType: AuditActorType;
  actorUserId?: string | null;
  actorTokenId?: string | null;
  action: string;
  outcome: AuditOutcome;
  resourceType: string;
  resourceId?: string | null;
  projectId?: string | null;
  details?: JsonObject;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// 呼び出し側は業務のトランザクションの接続を渡し、監査の行をそれと一緒にコミットまたは
// ロールバックさせる。
export async function writeAuditEvent(
  connection: Connection,
  event: AuditEventInput,
): Promise<void> {
  await connection.query(
    `INSERT INTO audit_events(actor_type,actor_user_id,actor_token_id,action,outcome,resource_type,
    resource_id,project_id,details,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    [
      event.actorType,
      event.actorUserId ?? null,
      event.actorTokenId ?? null,
      event.action,
      event.outcome,
      event.resourceType,
      event.resourceId ?? null,
      event.projectId ?? null,
      JSON.stringify(event.details ?? {}),
      event.ipAddress ?? null,
      event.userAgent ?? null,
    ],
  );
}

export interface AuditEventFilter {
  projectId?: string;
  action?: string;
  actorUserId?: string;
  outcome?: AuditOutcome;
  /** ページから除く操作（閲覧者がサインインを隠しているときはサインイン）。 */
  excludedActions?: readonly string[];
  // 前のページの最後のイベントのID。ページはそのイベントを含めず、その次から続く。
  cursor?: string;
  limit: number;
}

// 名前は読むときに結合する。名前を変えた利用者やProjectは、古いイベントでも今の名前で表示する。
const auditEventColumns = `a.id,a.occurred_at,a.actor_type,a.actor_user_id,u.display_name AS actor_name,
  a.actor_token_id,a.action,a.outcome,a.resource_type,a.resource_id,a.project_id,
  p.name AS project_name,a.details,a.ip_address,a.user_agent`;

// (occurred_at,id)によるキーセットのページ分けは、新しいイベントが追加されてもずれない。
export async function listAuditEvents(
  connection: Connection,
  filter: AuditEventFilter,
): Promise<AuditEvent[]> {
  return rows<AuditEvent>(
    connection,
    `SELECT ${auditEventColumns} FROM audit_events a
    LEFT JOIN users u ON u.id=a.actor_user_id LEFT JOIN projects p ON p.id=a.project_id
    WHERE ($1::uuid IS NULL OR a.project_id=$1) AND ($2::text IS NULL OR a.action=$2)
      AND ($3::uuid IS NULL OR a.actor_user_id=$3) AND ($4::text IS NULL OR a.outcome=$4)
      AND ($5::uuid IS NULL OR (a.occurred_at,a.id) < (SELECT occurred_at,id FROM audit_events WHERE id=$5))
      AND NOT (a.action = ANY($7::text[]))
    ORDER BY a.occurred_at DESC,a.id DESC LIMIT $6`,
    [
      filter.projectId ?? null,
      filter.action ?? null,
      filter.actorUserId ?? null,
      filter.outcome ?? null,
      filter.cursor ?? null,
      filter.limit,
      filter.excludedActions ?? [],
    ],
  );
}

// Projectの一覧はそのProjectのイベントだけをcursorとして受け付け、ほかのProjectのIDを探られない
// ようにする。
export async function auditCursorExists(
  connection: Connection,
  cursor: { id: string; projectId?: string },
): Promise<boolean> {
  return Boolean(
    await first(
      connection,
      'SELECT id FROM audit_events WHERE id=$1 AND ($2::uuid IS NULL OR project_id=$2)',
      [cursor.id, cursor.projectId ?? null],
    ),
  );
}
