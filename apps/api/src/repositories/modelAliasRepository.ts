import type {
  ModelAliasEvent,
  ModelAliasEventSource,
  ModelAliasProtection,
  ModelAliasProtectionRole,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

// model_aliasesに書くのはassignModelAliasとremoveModelAliasesだけ。これにより、どの変更も
// イベントを残し、Modelのロックの下で呼び出し側のガード（aliasの保護）を通る。

export interface ModelAliasActor {
  userId: string | null;
  tokenId: string | null;
}

export function modelAliasActor(principal: Principal): ModelAliasActor {
  return { userId: principal.user.id, tokenId: principal.token?.id ?? null };
}

/** ガードから見たaliasの変更1件。versionIdがnullなら削除。 */
export interface GuardedModelAliasChange {
  projectId: string;
  modelId: string;
  alias: string;
  versionId: string | null;
}

/**
 * 変更してよいかを決め、だめならDomainErrorを投げる。Modelのロックの後に呼ぶので、確認から
 * 書き込みまでの間にaliasとその保護が変わることは無い。
 */
export type ModelAliasGuard = (
  connection: Connection,
  change: GuardedModelAliasChange,
) => Promise<void>;

interface ModelAliasChange {
  projectId: string;
  modelId: string;
  alias: string;
  previousVersionId: string | null;
  versionId: string | null;
  source: ModelAliasEventSource;
  reason: string;
  evaluationId: string | null;
  actor: ModelAliasActor;
}

// 1つのModelのaliasの変更をすべて直列にする。model_aliasesの行ロックだけでは最初の割り当て
// （まだ行が無い）を守れず、これが無いと同時の最初の割り当てが2つともprevious_version_id NULLを
// 記録する。イベントの行のためにModelのProjectを返す。
async function lockModel(connection: Connection, modelId: string): Promise<string> {
  const model = await first<{ projectId: string }>(
    connection,
    'SELECT project_id FROM models WHERE id=$1 FOR UPDATE',
    [modelId],
  );
  if (!model) notFound('model');
  return model.projectId;
}

async function appendModelAliasEvent(
  connection: Connection,
  change: ModelAliasChange,
): Promise<string> {
  const event = await first<{ id: string }>(
    connection,
    // トランザクションの開始時刻でなくclock_timestampを使う。イベントはModelのロックの後に
    // 書くので、created_atがロックの順に並び、履歴を前の値から次の値への連なりとして読める。
    `INSERT INTO model_alias_events(project_id,model_id,alias,previous_version_id,version_id,source,
    reason,promotion_evaluation_id,actor_user_id,actor_token_id,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()) RETURNING id`,
    [
      change.projectId,
      change.modelId,
      change.alias,
      change.previousVersionId,
      change.versionId,
      change.source,
      change.reason,
      change.evaluationId,
      change.actor.userId,
      change.actor.tokenId,
    ],
  );
  return event!.id;
}

/**
 * aliasをversionIdに向ける。既に向いているバージョンを割り当て直しても何も変えずイベントも記録
 * しないので、SDKが同じset_registered_model_aliasを再試行しても履歴は増えない。記録したイベントの
 * idを返し、aliasが既にversionIdを向いていたらnullを返す。
 */
export async function assignModelAlias(
  connection: Connection,
  assignment: {
    modelId: string;
    alias: string;
    versionId: string;
    actor: ModelAliasActor;
    source: ModelAliasEventSource;
    reason?: string;
    evaluationId?: string | null;
    guard: ModelAliasGuard;
  },
): Promise<string | null> {
  const projectId = await lockModel(connection, assignment.modelId);
  const current = await first<{ versionId: string }>(
    connection,
    'SELECT version_id FROM model_aliases WHERE model_id=$1 AND alias=$2',
    [assignment.modelId, assignment.alias],
  );
  if (current?.versionId === assignment.versionId) return null;
  await assignment.guard(connection, {
    projectId,
    modelId: assignment.modelId,
    alias: assignment.alias,
    versionId: assignment.versionId,
  });
  await connection.query(
    'INSERT INTO model_aliases(model_id,alias,version_id) VALUES($1,$2,$3) ON CONFLICT(model_id,alias) DO UPDATE SET version_id=EXCLUDED.version_id',
    [assignment.modelId, assignment.alias, assignment.versionId],
  );
  return appendModelAliasEvent(connection, {
    projectId,
    modelId: assignment.modelId,
    alias: assignment.alias,
    previousVersionId: current?.versionId ?? null,
    versionId: assignment.versionId,
    source: assignment.source,
    reason: assignment.reason ?? '',
    evaluationId: assignment.evaluationId ?? null,
    actor: assignment.actor,
  });
}

/**
 * aliasかversionIdで絞ったModelのaliasを消し（どちらも無ければすべて）、実際に消したaliasごとに
 * 削除のイベントを1つ記録する。消したaliasの名前を返す。
 */
export async function removeModelAliases(
  connection: Connection,
  removal: {
    modelId: string;
    alias?: string;
    versionId?: string;
    actor: ModelAliasActor;
    source: ModelAliasEventSource;
    reason?: string;
    guard: ModelAliasGuard;
  },
): Promise<string[]> {
  const projectId = await lockModel(connection, removal.modelId);
  const targets = await rows<{ alias: string }>(
    connection,
    `SELECT alias FROM model_aliases WHERE model_id=$1 AND ($2::text IS NULL OR alias=$2)
    AND ($3::uuid IS NULL OR version_id=$3) ORDER BY alias`,
    [removal.modelId, removal.alias ?? null, removal.versionId ?? null],
  );
  for (const target of targets)
    await removal.guard(connection, {
      projectId,
      modelId: removal.modelId,
      alias: target.alias,
      versionId: null,
    });
  const removed = await rows<{ alias: string; versionId: string }>(
    connection,
    `DELETE FROM model_aliases WHERE model_id=$1 AND ($2::text IS NULL OR alias=$2)
    AND ($3::uuid IS NULL OR version_id=$3) RETURNING alias,version_id`,
    [removal.modelId, removal.alias ?? null, removal.versionId ?? null],
  );
  for (const alias of removed.sort((left, right) => left.alias.localeCompare(right.alias)))
    await appendModelAliasEvent(connection, {
      projectId,
      modelId: removal.modelId,
      alias: alias.alias,
      previousVersionId: alias.versionId,
      versionId: null,
      source: removal.source,
      reason: removal.reason ?? '',
      evaluationId: null,
      actor: removal.actor,
    });
  return removed.map((alias) => alias.alias);
}

const modelAliasEventSelect = `SELECT e.id,e.project_id,e.model_id,e.alias,e.previous_version_id,
  pv.version AS previous_version,e.version_id,v.version,e.source,e.reason,e.promotion_evaluation_id,
  CASE WHEN e.actor_user_id IS NULL THEN NULL ELSE jsonb_build_object('userId',u.id,
    'displayName',u.display_name,'tokenId',e.actor_token_id) END AS actor,e.created_at
  FROM model_alias_events e
  LEFT JOIN model_versions pv ON pv.id=e.previous_version_id
  LEFT JOIN model_versions v ON v.id=e.version_id
  LEFT JOIN users u ON u.id=e.actor_user_id`;

// (created_at,id)によるキーセットのページ分けは、新しいイベントが追加されてもずれない。
export function listModelAliasEvents(
  connection: Connection,
  filter: { modelId: string; alias?: string; cursor?: string; limit: number },
): Promise<ModelAliasEvent[]> {
  return rows<ModelAliasEvent>(
    connection,
    `${modelAliasEventSelect}
    WHERE e.model_id=$1 AND ($2::text IS NULL OR e.alias=$2)
      AND ($3::uuid IS NULL OR (e.created_at,e.id) < (SELECT created_at,id FROM model_alias_events WHERE id=$3))
    ORDER BY e.created_at DESC,e.id DESC LIMIT $4`,
    [filter.modelId, filter.alias ?? null, filter.cursor ?? null, filter.limit],
  );
}

// ほかのModelのイベントのIDを探られないよう、cursorは一覧しているModelのものに限る。
export async function modelAliasEventCursorExists(
  connection: Connection,
  cursor: { id: string; modelId: string },
): Promise<boolean> {
  return Boolean(
    await first(connection, 'SELECT id FROM model_alias_events WHERE id=$1 AND model_id=$2', [
      cursor.id,
      cursor.modelId,
    ]),
  );
}

/** aliasが今指しているバージョン。設定されていなければnull。 */
export async function findModelAliasVersion(
  connection: Connection,
  reference: { modelId: string; alias: string },
): Promise<string | null> {
  const current = await first<{ versionId: string }>(
    connection,
    'SELECT version_id FROM model_aliases WHERE model_id=$1 AND alias=$2',
    [reference.modelId, reference.alias],
  );
  return current?.versionId ?? null;
}

/** Modelのaliasの変更がすべて取るロックを取り、その後に読んだaliasが変わらないようにする。 */
export async function lockModelAliases(connection: Connection, modelId: string): Promise<void> {
  await lockModel(connection, modelId);
}

// ---- aliasの保護 ----

const aliasProtectionColumns = `id,project_id,model_id,alias,required_role,require_passed_evaluation,
  created_by,created_at,updated_by,updated_at`;
const aliasProtectionSelect = `SELECT ${aliasProtectionColumns} FROM model_alias_protections`;

/** Project全体の保護と、modelIdがあればそのModelの保護（Project全体のものが先）。 */
export function listModelAliasProtections(
  connection: Connection,
  filter: { projectId: string; modelId?: string },
): Promise<ModelAliasProtection[]> {
  return rows<ModelAliasProtection>(
    connection,
    `${aliasProtectionSelect} WHERE project_id=$1
      AND ($2::uuid IS NULL OR model_id IS NULL OR model_id=$2)
    ORDER BY model_id NULLS FIRST,alias`,
    [filter.projectId, filter.modelId ?? null],
  );
}

/** Modelのaliasに効く保護すべて。Project全体のものとModel自身のもの。 */
export function findApplicableAliasProtections(
  connection: Connection,
  reference: { projectId: string; modelId: string; alias: string },
): Promise<ModelAliasProtection[]> {
  return rows<ModelAliasProtection>(
    connection,
    `${aliasProtectionSelect} WHERE project_id=$1 AND alias=$3 AND (model_id IS NULL OR model_id=$2)`,
    [reference.projectId, reference.modelId, reference.alias],
  );
}

export interface AliasProtectionTarget {
  projectId: string;
  /** Project全体の保護ならnull。 */
  modelId: string | null;
  alias: string;
}

/** aliasの保護を作るか置き換える。created_byとcreated_atは最初の値を保つ。 */
export async function upsertModelAliasProtection(
  connection: Connection,
  protection: AliasProtectionTarget & {
    requiredRole: ModelAliasProtectionRole;
    requirePassedEvaluation: boolean;
    actorUserId: string;
  },
): Promise<ModelAliasProtection> {
  // 2つの部分一意インデックスは1つのON CONFLICTの対象にまとめられないので、先にUPDATEを試す。
  const updated = await first<ModelAliasProtection>(
    connection,
    `UPDATE model_alias_protections SET required_role=$4,require_passed_evaluation=$5,updated_by=$6,
      updated_at=now()
    WHERE project_id=$1 AND model_id IS NOT DISTINCT FROM $2::uuid AND alias=$3
    RETURNING ${aliasProtectionColumns}`,
    [
      protection.projectId,
      protection.modelId,
      protection.alias,
      protection.requiredRole,
      protection.requirePassedEvaluation,
      protection.actorUserId,
    ],
  );
  if (updated) return updated;
  return (await first<ModelAliasProtection>(
    connection,
    `INSERT INTO model_alias_protections(project_id,model_id,alias,required_role,
      require_passed_evaluation,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$6)
    RETURNING ${aliasProtectionColumns}`,
    [
      protection.projectId,
      protection.modelId,
      protection.alias,
      protection.requiredRole,
      protection.requirePassedEvaluation,
      protection.actorUserId,
    ],
  ))!;
}

/** 消した保護を返す。aliasがその範囲で保護されていなかったらundefined。 */
export function deleteModelAliasProtection(
  connection: Connection,
  target: AliasProtectionTarget,
): Promise<ModelAliasProtection | undefined> {
  return first<ModelAliasProtection>(
    connection,
    `DELETE FROM model_alias_protections
    WHERE project_id=$1 AND model_id IS NOT DISTINCT FROM $2::uuid AND alias=$3
    RETURNING ${aliasProtectionColumns}`,
    [target.projectId, target.modelId, target.alias],
  );
}
