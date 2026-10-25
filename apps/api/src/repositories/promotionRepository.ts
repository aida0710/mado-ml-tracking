import type {
  ModelAutomationRule,
  PromotionCriterionResult,
  PromotionDecision,
  PromotionEvaluation,
  PromotionEvaluationReason,
  PromotionPolicy,
} from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import type { PromotionPolicyInput } from '../domain/promotionPolicyValidation.js';
import { liveProjectSql } from './projectRepository.js';

const evaluationColumns = `e.id,e.project_id,e.policy_id,p.model_id,e.candidate_version_id,
  e.candidate_run_id,e.baseline_version_id,e.baseline_run_id,e.decision,e.criteria_results,e.reason,
  e.promoted,e.alias_event_id,e.sequence,e.requested_by,e.created_at`;

export type PromotionEvaluationRule = Pick<
  ModelAutomationRule,
  'id' | 'kind' | 'modelFamilies' | 'inputDatasetVersionIds' | 'codeVersionId'
>;

export async function findEvaluationRule(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<PromotionEvaluationRule | undefined> {
  return first<PromotionEvaluationRule>(
    connection,
    `SELECT id,kind,model_families,input_dataset_version_ids,code_version_id
    FROM model_automation_rules WHERE id=$1 AND project_id=$2`,
    [reference.id, reference.projectId],
  );
}

// MLflowから削除したModelは行が残るので、ここで存在しないものと同じく除く。
export async function findActiveModelFamily(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<string | undefined> {
  const model = await first<{ family: string }>(
    connection,
    `SELECT m.family FROM models m
    LEFT JOIN mlflow_registered_model_metadata d ON d.model_id=m.id
    WHERE m.id=$1 AND m.project_id=$2 AND d.deleted_at IS NULL`,
    [reference.id, reference.projectId],
  );
  return model?.family;
}

export async function findModelIdOfVersion(
  connection: Connection,
  reference: { projectId: string; versionId: string },
): Promise<string | undefined> {
  const version = await first<{ modelId: string }>(
    connection,
    'SELECT model_id FROM model_versions WHERE id=$1 AND project_id=$2',
    [reference.versionId, reference.projectId],
  );
  return version?.modelId;
}

export async function insertPromotionPolicy(
  connection: Connection,
  policy: { projectId: string; input: PromotionPolicyInput; createdBy: string },
): Promise<PromotionPolicy> {
  const { input } = policy;
  return (await first<PromotionPolicy>(
    connection,
    `INSERT INTO model_promotion_policies(project_id,name,enabled,model_id,target_alias,baseline_alias,
      evaluation_rule_id,criteria,missing_baseline,auto_promote,created_by,run_as_user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$11) RETURNING *`,
    [
      policy.projectId,
      input.name,
      input.enabled,
      input.modelId,
      input.targetAlias,
      input.baselineAlias,
      input.evaluationRuleId,
      JSON.stringify(input.criteria),
      input.missingBaseline,
      input.autoPromote,
      policy.createdBy,
    ],
  ))!;
}

export async function listPromotionPolicies(
  connection: Connection,
  filter: { projectId: string; modelId?: string },
): Promise<PromotionPolicy[]> {
  // 一覧に実行名義の利用者の名前を含め、画面が名前で人とService Accountを見分けられるようにする。
  return rows<PromotionPolicy>(
    connection,
    `SELECT p.*,u.kind AS run_as_kind,u.display_name AS run_as_name
    FROM model_promotion_policies p JOIN users u ON u.id=p.run_as_user_id
    WHERE p.project_id=$1 AND ($2::uuid IS NULL OR p.model_id=$2)
    ORDER BY p.created_at DESC,p.id DESC`,
    [filter.projectId, filter.modelId ?? null],
  );
}

export async function lockPromotionPolicy(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<PromotionPolicy | undefined> {
  return first<PromotionPolicy>(
    connection,
    'SELECT * FROM model_promotion_policies WHERE id=$1 AND project_id=$2 FOR SHARE',
    [reference.id, reference.projectId],
  );
}

export async function setPromotionPolicyEnabled(
  connection: Connection,
  change: { projectId: string; id: string; enabled: boolean },
): Promise<PromotionPolicy | undefined> {
  return first<PromotionPolicy>(
    connection,
    'UPDATE model_promotion_policies SET enabled=$3 WHERE id=$1 AND project_id=$2 RETURNING *',
    [change.id, change.projectId, change.enabled],
  );
}

/** ポリシーの行をロックし、同時の所有者の変更を直列にする。そのProjectに無ければundefined。 */
export async function lockPromotionPolicyForUpdate(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<PromotionPolicy | undefined> {
  return first<PromotionPolicy>(
    connection,
    'SELECT * FROM model_promotion_policies WHERE id=$1 AND project_id=$2 FOR UPDATE',
    [reference.id, reference.projectId],
  );
}

export async function setPromotionPolicyRunAsUser(
  connection: Connection,
  change: { projectId: string; id: string; runAsUserId: string },
): Promise<PromotionPolicy> {
  return (await first<PromotionPolicy>(
    connection,
    'UPDATE model_promotion_policies SET run_as_user_id=$3 WHERE id=$1 AND project_id=$2 RETURNING *',
    [change.id, change.projectId, change.runAsUserId],
  ))!;
}

// FOR SHAREで同時の有効化・無効化を待たせ、この時点のポリシーの組を使う。
export async function lockEnabledPoliciesForRule(
  connection: Connection,
  filter: { projectId: string; evaluationRuleId: string; modelId: string },
): Promise<PromotionPolicy[]> {
  return rows<PromotionPolicy>(
    connection,
    `SELECT * FROM model_promotion_policies
    WHERE project_id=$1 AND evaluation_rule_id=$2 AND model_id=$3 AND enabled
    ORDER BY created_at,id FOR SHARE`,
    [filter.projectId, filter.evaluationRuleId, filter.modelId],
  );
}

/**
 * ポリシーの実行名義の利用者が、今もポリシーに自分の名義で動かせるか。Projectがアーカイブ
 * されていない間で、全体管理者か、直接の付与かグループの割り当てでProject adminである有効な
 * 利用者なら動かせる。
 */
export async function hasPromotionRunAsAccess(
  connection: Connection,
  policy: { projectId: string; runAsUserId: string },
): Promise<boolean> {
  const runAsUser = await first<{ hasAccess: boolean }>(
    connection,
    `SELECT u.status='active' AND ${liveProjectSql('$2')} AND (u.is_admin OR EXISTS (
      SELECT 1 FROM effective_project_roles r WHERE r.project_id=$2 AND r.user_id=u.id AND r.role='admin'
    )) AS has_access FROM users u WHERE u.id=$1`,
    [policy.runAsUserId, policy.projectId],
  );
  return runAsUser?.hasAccess === true;
}

export interface PromotionEvaluationRecord {
  projectId: string;
  policyId: string;
  candidateVersionId: string;
  candidateRunId: string;
  baselineVersionId: string | null;
  baselineRunId: string | null;
  decision: PromotionDecision;
  criteriaResults: PromotionCriterionResult[];
  reason: PromotionEvaluationReason | null;
  sequence: number;
  requestedBy: string | null;
  /**
   * 自動の昇格がまとめて設定する。idはそれを指すaliasのイベントより先に決めたもので（イベントの
   * 外部キーは遅延検査）、aliasEventIdはそのイベント。
   */
  promotion?: { id: string; aliasEventId: string };
}

/** 新しい判定のidを返す。その(policy, Run, sequence)が既に記録済みならnull。 */
export async function insertPromotionEvaluation(
  connection: Connection,
  record: PromotionEvaluationRecord,
): Promise<string | null> {
  const inserted = await first<{ id: string }>(
    connection,
    `INSERT INTO model_promotion_evaluations(id,project_id,policy_id,candidate_version_id,
      candidate_run_id,baseline_version_id,baseline_run_id,decision,criteria_results,reason,sequence,
      requested_by,promoted,alias_event_id)
    VALUES(COALESCE($12::uuid,gen_random_uuid()),$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,
      $13::uuid IS NOT NULL,$13)
    ON CONFLICT (policy_id,candidate_run_id,sequence) DO NOTHING RETURNING id`,
    [
      record.projectId,
      record.policyId,
      record.candidateVersionId,
      record.candidateRunId,
      record.baselineVersionId,
      record.baselineRunId,
      record.decision,
      JSON.stringify(record.criteriaResults),
      record.reason,
      record.sequence,
      record.requestedBy,
      record.promotion?.id ?? null,
      record.promotion?.aliasEventId ?? null,
    ],
  );
  return inserted?.id ?? null;
}

/** 手動のaliasの変更の根拠として示した昇格の判定。 */
export interface PromotionEvidence {
  decision: PromotionDecision;
  modelId: string;
  candidateVersionId: string;
  targetAlias: string;
  /** 同じポリシーで同じ候補のRunを後から評価し直したものがあればfalse。 */
  isLatest: boolean;
}

export async function findPromotionEvidence(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<PromotionEvidence | undefined> {
  return first<PromotionEvidence>(
    connection,
    `SELECT e.decision,p.model_id,e.candidate_version_id,p.target_alias,NOT EXISTS (
      SELECT 1 FROM model_promotion_evaluations later WHERE later.policy_id=e.policy_id
        AND later.candidate_run_id=e.candidate_run_id AND later.sequence>e.sequence
    ) AS is_latest
    FROM model_promotion_evaluations e JOIN model_promotion_policies p ON p.id=e.policy_id
    WHERE e.id=$1 AND e.project_id=$2`,
    [reference.id, reference.projectId],
  );
}

export async function hasPromotionEvaluation(
  connection: Connection,
  reference: { policyId: string; candidateRunId: string },
): Promise<boolean> {
  return (
    (await first(
      connection,
      'SELECT 1 FROM model_promotion_evaluations WHERE policy_id=$1 AND candidate_run_id=$2 LIMIT 1',
      [reference.policyId, reference.candidateRunId],
    )) !== undefined
  );
}

/**
 * 1つのポリシーでの1つの候補のRunについての判定をすべてロックし、次のsequenceを返す。行は
 * 追記だけなので、FOR UPDATEは同時の再評価を直列にするだけ。
 */
export async function lockNextEvaluationSequence(
  connection: Connection,
  reference: { policyId: string; candidateRunId: string },
): Promise<number> {
  const locked = await rows<{ sequence: number }>(
    connection,
    `SELECT sequence FROM model_promotion_evaluations WHERE policy_id=$1 AND candidate_run_id=$2
    ORDER BY sequence FOR UPDATE`,
    [reference.policyId, reference.candidateRunId],
  );
  return (locked.at(-1)?.sequence ?? 0) + 1;
}

export async function findPromotionEvaluation(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<PromotionEvaluation | undefined> {
  return first<PromotionEvaluation>(
    connection,
    `SELECT ${evaluationColumns} FROM model_promotion_evaluations e
    JOIN model_promotion_policies p ON p.id=e.policy_id
    WHERE e.id=$1 AND e.project_id=$2`,
    [reference.id, reference.projectId],
  );
}

export interface PromotionEvaluationFilter {
  projectId: string;
  modelId?: string;
  policyId?: string;
  candidateVersionId?: string;
  // 前のページの最後の判定のID。ページはその判定を含めず、その次から続く。
  cursor?: string;
  limit: number;
}

// (created_at,id)によるキーセットのページ分けは、新しい判定が追加されてもずれない。
export async function listPromotionEvaluations(
  connection: Connection,
  filter: PromotionEvaluationFilter,
): Promise<PromotionEvaluation[]> {
  return rows<PromotionEvaluation>(
    connection,
    `SELECT ${evaluationColumns} FROM model_promotion_evaluations e
    JOIN model_promotion_policies p ON p.id=e.policy_id
    WHERE e.project_id=$1 AND ($2::uuid IS NULL OR p.model_id=$2) AND ($3::uuid IS NULL OR e.policy_id=$3)
      AND ($4::uuid IS NULL OR e.candidate_version_id=$4)
      AND ($5::uuid IS NULL OR (e.created_at,e.id) < (
        SELECT created_at,id FROM model_promotion_evaluations WHERE id=$5))
    ORDER BY e.created_at DESC,e.id DESC LIMIT $6`,
    [
      filter.projectId,
      filter.modelId ?? null,
      filter.policyId ?? null,
      filter.candidateVersionId ?? null,
      filter.cursor ?? null,
      filter.limit,
    ],
  );
}

// Projectの一覧はそのProjectの判定だけをcursorとして受け付け、ほかのProjectのIDを探られない
// ようにする。
export async function promotionEvaluationCursorExists(
  connection: Connection,
  cursor: { projectId: string; id: string },
): Promise<boolean> {
  return (
    (await first(
      connection,
      'SELECT 1 FROM model_promotion_evaluations WHERE id=$1 AND project_id=$2',
      [cursor.id, cursor.projectId],
    )) !== undefined
  );
}
