import type { ModelAutomationExecution, ModelAutomationRule } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { liveProjectSql } from './projectRepository.js';

export type AutomationEventState = 'pending' | 'processed' | 'source_unsuccessful' | 'source_timeout';

export interface PendingAutomationEvent {
  modelVersionId: string;
  projectId: string;
}

const storedExecutionSelect = `SELECT e.id,e.project_id,e.rule_id,e.model_version_id,e.run_id,e.job_id,e.status,e.error,
  e.created_at,mv.source_run_id,r.status AS run_status,j.status AS job_status,
  r.started_at AS run_started_at,r.ended_at AS run_ended_at,e.trigger_run_id,
  e.pipeline_root_execution_id,e.attempt,e.source,e.requested_by,e.retry_of_execution_id
  FROM model_automation_executions e
  JOIN model_versions mv ON mv.id=e.model_version_id
  LEFT JOIN runs r ON r.id=e.run_id AND r.project_id=e.project_id
  LEFT JOIN jobs j ON j.id=e.job_id AND j.project_id=e.project_id
  WHERE e.project_id=$1`;

// 保留中のイベントにはまだ保存した実行が無いので、バージョンのfamilyの有効な登録時のルールを、
// それぞれこれから行う実行として見せる。idは読むたびに変わらないよう(version, rule)から作る。
// 完了時に作る保存した実行には別のidが付く。
const pendingExecutionSelect = `SELECT md5(ev.model_version_id::text||rule.id::text)::uuid AS id,ev.project_id,
  rule.id AS rule_id,ev.model_version_id,NULL::uuid AS run_id,NULL::uuid AS job_id,'pending' AS status,
  NULL AS error,ev.pending_since AS created_at,ev.source_run_id,NULL AS run_status,NULL AS job_status,
  NULL::timestamptz AS run_started_at,NULL::timestamptz AS run_ended_at,
  NULL::uuid AS trigger_run_id,md5(ev.model_version_id::text||rule.id::text)::uuid AS pipeline_root_execution_id,
  1 AS attempt,'automatic' AS source,NULL::uuid AS requested_by,NULL::uuid AS retry_of_execution_id
  FROM model_automation_events ev
  JOIN model_versions mv ON mv.id=ev.model_version_id
  JOIN models m ON m.id=mv.model_id
  JOIN model_automation_rules rule ON rule.project_id=ev.project_id AND rule.enabled
    AND rule.trigger='model_registered' AND m.family=ANY(rule.model_families)
  WHERE ev.project_id=$1 AND ev.state='pending'`;

// 保存した行と保留中の行を合わせる。どちらのSELECTもProjectを$1で受け取る。
const executionSource = `(${storedExecutionSelect} UNION ALL ${pendingExecutionSelect}) e`;

export interface AutomationExecutionFilter {
  projectId: string;
  modelVersionId?: string;
  ruleId?: string;
}

// cursorの行の(createdAt, id)。絞り込んだ一覧に無ければundefined。時刻は文字列のままにする。
// JavaScriptのDateにすると、境界からPostgreSQLのマイクロ秒が落ちる。
export async function findAutomationExecutionBoundary(
  connection: Connection,
  reference: AutomationExecutionFilter & { id: string },
): Promise<{ id: string; createdAt: string } | undefined> {
  return first(
    connection,
    `SELECT id,created_at::text AS created_at FROM ${executionSource}
    WHERE e.id=$2 AND ($3::uuid IS NULL OR e.model_version_id=$3) AND ($4::uuid IS NULL OR e.rule_id=$4)`,
    [reference.projectId, reference.id, reference.modelVersionId ?? null, reference.ruleId ?? null],
  );
}

export async function listAutomationExecutions(
  connection: Connection,
  page: AutomationExecutionFilter & {
    limit: number;
    after?: { id: string; createdAt: string };
  },
): Promise<ModelAutomationExecution[]> {
  return rows(
    connection,
    `SELECT * FROM ${executionSource}
    WHERE ($2::uuid IS NULL OR e.model_version_id=$2) AND ($3::uuid IS NULL OR e.rule_id=$3)
      AND ($4::timestamptz IS NULL OR (e.created_at,e.id)<($4::timestamptz,$5::uuid))
    ORDER BY e.created_at DESC,e.id DESC LIMIT $6`,
    [
      page.projectId,
      page.modelVersionId ?? null,
      page.ruleId ?? null,
      page.after?.createdAt ?? null,
      page.after?.id ?? null,
      page.limit,
    ],
  );
}

export async function findAutomationExecution(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<ModelAutomationExecution | undefined> {
  return first(connection, `${storedExecutionSelect} AND e.id=$2`, [
    reference.projectId,
    reference.id,
  ]);
}

// 手動の適用は、そのバージョンに対するルールのすべての試行と比べる。待機中か実行中のものがあれば
// 次を止め、次の試行の番号は最大の番号の次にする。
export async function summarizeRuleAttempts(
  connection: Connection,
  reference: { ruleId: string; modelVersionId: string },
): Promise<{ maxAttempt: number; hasActive: boolean }> {
  const summary = await first<{ maxAttempt: number; hasActive: boolean }>(
    connection,
    `SELECT COALESCE(max(e.attempt),0)::int AS max_attempt,
      COALESCE(bool_or(e.status='queued' AND j.status IN ('queued','claimed','running')),false) AS has_active
    FROM model_automation_executions e
    LEFT JOIN jobs j ON j.id=e.job_id AND j.project_id=e.project_id
    WHERE e.rule_id=$1 AND e.model_version_id=$2`,
    [reference.ruleId, reference.modelVersionId],
  );
  return summary ?? { maxAttempt: 0, hasActive: false };
}

export async function hasExecutionForTriggerRun(
  connection: Connection,
  reference: { ruleId: string; triggerRunId: string },
): Promise<boolean> {
  const execution = await first(
    connection,
    'SELECT id FROM model_automation_executions WHERE rule_id=$1 AND trigger_run_id=$2 LIMIT 1',
    [reference.ruleId, reference.triggerRunId],
  );
  return execution !== undefined;
}

// FOR SHAREで同時の有効化・無効化を待たせ、この時点のルールの組を使う。
export async function lockRegistrationRules(
  connection: Connection,
  model: { projectId: string; family: string },
): Promise<ModelAutomationRule[]> {
  return rows(
    connection,
    `SELECT * FROM model_automation_rules
    WHERE project_id=$1 AND enabled AND trigger='model_registered' AND $2=ANY(model_families)
    ORDER BY created_at,id FOR SHARE`,
    [model.projectId, model.family],
  );
}

export async function lockDownstreamRules(
  connection: Connection,
  upstream: { projectId: string; ruleId: string; family: string },
): Promise<ModelAutomationRule[]> {
  return rows(
    connection,
    `SELECT * FROM model_automation_rules
    WHERE project_id=$1 AND enabled AND trigger='upstream_run_finished' AND upstream_rule_id=$2
      AND $3=ANY(model_families)
    ORDER BY created_at,id FOR SHARE`,
    [upstream.projectId, upstream.ruleId, upstream.family],
  );
}

export async function lockAutomationRule(
  connection: Connection,
  reference: { projectId: string; id: string; mode: 'share' | 'update' },
): Promise<ModelAutomationRule | undefined> {
  // NO KEY UPDATEで1つのルールの手動の適用を直列にしつつ、実行の挿入は妨げない。挿入は外部キーを
  // 通じてルールにKEY SHAREを取るだけ。
  const lock = reference.mode === 'share' ? 'FOR SHARE' : 'FOR NO KEY UPDATE';
  return first(
    connection,
    `SELECT * FROM model_automation_rules WHERE id=$1 AND project_id=$2 ${lock}`,
    [reference.id, reference.projectId],
  );
}

/**
 * 最初の段からruleIdまでのルールの数を数える（最初の段のルールは1）。ルールは変更できず、ほかの
 * ルールから名指しされる前に存在している必要があるので、循環は保存できない。それでも、データを
 * 手で書き換えた場合に備え、経路の検査は無限に再帰せずに循環を報告する。
 */
export async function measureRuleChain(
  connection: Connection,
  reference: { projectId: string; ruleId: string; maxDepth: number },
): Promise<{ depth: number; hasCycle: boolean }> {
  const chain = await first<{ depth: number; hasCycle: boolean }>(
    connection,
    `WITH RECURSIVE chain(id,upstream_rule_id,depth,path,is_cycle) AS (
      SELECT id,upstream_rule_id,1,ARRAY[id],false FROM model_automation_rules
      WHERE id=$1 AND project_id=$2
      UNION ALL
      SELECT r.id,r.upstream_rule_id,c.depth+1,c.path||r.id,r.id=ANY(c.path)
      FROM chain c JOIN model_automation_rules r ON r.id=c.upstream_rule_id AND r.project_id=$2
      WHERE NOT c.is_cycle AND c.depth<=$3
    )
    SELECT max(depth)::int AS depth,bool_or(is_cycle) AS has_cycle FROM chain`,
    [reference.ruleId, reference.projectId, reference.maxDepth],
  );
  return { depth: chain?.depth ?? 0, hasCycle: chain?.hasCycle === true };
}

export async function insertAutomationEvent(
  connection: Connection,
  event: { modelVersionId: string; projectId: string; sourceRunId: string | null; isPending: boolean },
): Promise<boolean> {
  // ON CONFLICTは同時に進む登録の処理を待つ。ロールバックすれば、イベントは再試行できる状態で残る。
  const inserted = await first(
    connection,
    `INSERT INTO model_automation_events(model_version_id,project_id,source_run_id,state,pending_since)
    VALUES($1,$2,$3,$4,CASE WHEN $4='pending' THEN now() END) ON CONFLICT DO NOTHING RETURNING model_version_id`,
    [
      event.modelVersionId,
      event.projectId,
      event.sourceRunId,
      event.isPending ? 'pending' : 'processed',
    ],
  );
  return inserted !== undefined;
}

// 終了時のハンドラとsweeperはどちらも保留中のイベントをロックするので、各イベントは1回だけ
// 処理される。
export async function lockPendingAutomationEvents(
  connection: Connection,
  sourceRunId: string,
): Promise<PendingAutomationEvent[]> {
  return rows(
    connection,
    `SELECT model_version_id,project_id FROM model_automation_events
    WHERE source_run_id=$1 AND state='pending' ORDER BY pending_since,model_version_id FOR UPDATE`,
    [sourceRunId],
  );
}

// SKIP LOCKEDにより、終了時のハンドラがちょうど処理しているイベントはそのハンドラに任せる。
export async function lockExpiredAutomationEvents(
  connection: Connection,
  expiry: { maxAgeHours: number; limit: number },
): Promise<PendingAutomationEvent[]> {
  return rows(
    connection,
    `SELECT ev.model_version_id,ev.project_id FROM model_automation_events ev
    LEFT JOIN runs r ON r.id=ev.source_run_id AND r.project_id=ev.project_id
    WHERE ev.state='pending'
      AND (ev.pending_since<now()-make_interval(hours=>$1) OR r.lifecycle_stage='deleted')
    ORDER BY ev.pending_since,ev.model_version_id LIMIT $2 FOR UPDATE OF ev SKIP LOCKED`,
    [expiry.maxAgeHours, expiry.limit],
  );
}

export async function resolveAutomationEvent(
  connection: Connection,
  resolution: { modelVersionId: string; state: Exclude<AutomationEventState, 'pending'> },
): Promise<void> {
  await connection.query(
    `UPDATE model_automation_events SET state=$2 WHERE model_version_id=$1 AND state='pending'`,
    [resolution.modelVersionId, resolution.state],
  );
}

export interface AutomationExecutionInsert {
  // 呼び出し側がidを決めれば、行ができる前にそのidをRunに付けられる（automation.pipelineRoot）。
  id?: string;
  projectId: string;
  ruleId: string;
  modelVersionId: string;
  runId?: string;
  jobId?: string;
  status: Exclude<ModelAutomationExecution['status'], 'pending'>;
  error?: string;
  triggerRunId?: string | null;
  // 最初の段では省く。DBがその実行自身をpipelineの起点にする。
  pipelineRootExecutionId?: string | null;
  attempt?: number;
  source?: ModelAutomationExecution['source'];
  requestedBy?: string | null;
  retryOfExecutionId?: string | null;
}

export async function insertAutomationExecution(
  connection: Connection,
  execution: AutomationExecutionInsert,
): Promise<string> {
  const inserted = await first<{ id: string }>(
    connection,
    `INSERT INTO model_automation_executions(id,project_id,rule_id,model_version_id,run_id,job_id,status,error,
      trigger_run_id,pipeline_root_execution_id,attempt,source,requested_by,retry_of_execution_id)
    VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      execution.id ?? null,
      execution.projectId,
      execution.ruleId,
      execution.modelVersionId,
      execution.runId ?? null,
      execution.jobId ?? null,
      execution.status,
      execution.error ?? null,
      execution.triggerRunId ?? null,
      execution.pipelineRootExecutionId ?? null,
      execution.attempt ?? 1,
      execution.source ?? 'automatic',
      execution.requestedBy ?? null,
      execution.retryOfExecutionId ?? null,
    ],
  );
  return inserted!.id;
}

/**
 * ルールを動かす名義の利用者が、今もそれを動かせるか。有効な全体管理者か、Projectのroleがadminの
 * 有効な利用者（直接のmembershipとSSOのグループの割り当てのうち高い方）なら動かせる。Projectを
 * アーカイブしている間は誰も動かせない。
 */
export async function hasAutomationOwnerAccess(
  connection: Connection,
  rule: Pick<ModelAutomationRule, 'projectId' | 'runAsUserId'>,
): Promise<boolean> {
  const owner = await first<{ hasAccess: boolean }>(
    connection,
    `SELECT u.status='active' AND ${liveProjectSql('$2')}
      AND (u.is_admin OR COALESCE(m.role='admin',false)) AS has_access FROM users u
    LEFT JOIN effective_project_roles m ON m.user_id=u.id AND m.project_id=$2 WHERE u.id=$1`,
    [rule.runAsUserId, rule.projectId],
  );
  return owner?.hasAccess === true;
}

// APIの応答に所有者の名前を含めて画面が人とService Accountを見分けられるようにし、作成者の名前も
// 含めてルールの詳細に利用者のidがそのまま出ないようにする。
const ruleWithOwnerSelect = `SELECT r.*,u.kind AS run_as_kind,u.display_name AS run_as_name,
  c.display_name AS created_by_name
  FROM model_automation_rules r JOIN users u ON u.id=r.run_as_user_id
  LEFT JOIN users c ON c.id=r.created_by`;

export async function listAutomationRules(
  connection: Connection,
  projectId: string,
): Promise<ModelAutomationRule[]> {
  return rows(
    connection,
    `${ruleWithOwnerSelect} WHERE r.project_id=$1 ORDER BY r.created_at DESC,r.id DESC`,
    [projectId],
  );
}

export async function findAutomationRule(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<ModelAutomationRule | undefined> {
  return first(connection, `${ruleWithOwnerSelect} WHERE r.id=$1 AND r.project_id=$2`, [
    reference.id,
    reference.projectId,
  ]);
}

export async function updateAutomationRuleOwner(
  connection: Connection,
  owner: { ruleId: string; runAsUserId: string },
): Promise<void> {
  await connection.query('UPDATE model_automation_rules SET run_as_user_id=$2 WHERE id=$1', [
    owner.ruleId,
    owner.runAsUserId,
  ]);
}

/** 渡した実行を既に再試行した実行（あれば）。再試行は1回だけ作る。 */
export async function findAutomaticRetry(
  connection: Connection,
  executionId: string,
): Promise<{ id: string } | undefined> {
  return first(
    connection,
    'SELECT id FROM model_automation_executions WHERE retry_of_execution_id=$1',
    [executionId],
  );
}
