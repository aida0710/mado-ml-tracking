import type { ModelAliasProtection } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import {
  combineAliasProtections,
  type ModelAliasProtectionInput,
} from '../domain/modelAliasValidation.js';
import { satisfiesProjectRole } from '../domain/projectRoles.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  deleteModelAliasProtection,
  findApplicableAliasProtections,
  listModelAliasProtections,
  upsertModelAliasProtection,
  type AliasProtectionTarget,
  type GuardedModelAliasChange,
  type ModelAliasGuard,
} from '../repositories/modelAliasRepository.js';
import {
  findPromotionEvidence,
  hasPromotionRunAsAccess,
} from '../repositories/promotionRepository.js';
import { assertProjectReference } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

/** 保護 alias を変えられない失敗。どの alias かを横の項目に置く。 */
function aliasProtected(alias: string, message: string): never {
  throw new DomainError({ status: 403, code: 'alias_protected', message, details: { alias } });
}

/**
 * 根拠は、まさにこのalias・登録モデル・バージョンに対するpolicyの現在の判定で、合格している
 * 必要がある。同じ候補Runをあとで評価し直すと、判定はそれに置き換わる。
 */
async function requirePassedEvidence(
  connection: Connection,
  evidence: GuardedModelAliasChange & { versionId: string; evaluationId: string },
): Promise<void> {
  const decision = await findPromotionEvidence(connection, {
    projectId: evidence.projectId,
    id: evidence.evaluationId,
  });
  if (!decision) notFound('promotion evaluation');
  if (
    decision.modelId !== evidence.modelId ||
    decision.candidateVersionId !== evidence.versionId ||
    decision.targetAlias !== evidence.alias
  )
    throw new DomainError({
      status: 422,
      code: 'alias_evaluation_mismatch',
      message: 'the evaluation given as the basis must target the same model, version and alias',
    });
  if (decision.decision !== 'passed' || !decision.isLatest)
    throw new DomainError({
      status: 409,
      code: 'alias_evaluation_not_passed',
      message: 'the evaluation given as the basis has not passed (an evaluation replaced by a re-evaluation cannot be used either)',
    });
}

/**
 * native API（画面、SDK、API token）から手で行うaliasの変更の検査。保護されたaliasには、保護で
 * 指定したroleが要る。割り当てにはさらに根拠が要る。合格した判定（requirePassedEvaluationなら
 * 必ず）か、少なくとも理由。合格した判定を求めるaliasを外すにはProject adminが要る。外すことを
 * 正当化できる判定は無いため。判定を指定したときは、保護されていないaliasでもその判定を確かめる。
 * aliasのイベントに記録されるため。
 */
export function manualAliasGuard(
  principal: Principal,
  evidence: { evaluationId?: string; reason?: string } = {},
): ModelAliasGuard {
  return async (connection, change) => {
    const protection = combineAliasProtections(
      await findApplicableAliasProtections(connection, change),
    );
    if (protection) {
      const role = await requireProject(connection, principal, {
        projectId: change.projectId,
        role: 'viewer',
        scope: 'registry:write',
      });
      if (!satisfiesProjectRole(role, protection.requiredRole))
        aliasProtected(
          change.alias,
          `changing the protected alias "${change.alias}" requires the ${protection.requiredRole} role in the project`,
        );
      if (change.versionId === null && protection.requirePassedEvaluation && role !== 'admin')
        aliasProtected(
          change.alias,
          `removing the protected alias "${change.alias}", which requires a passing evaluation, requires a project admin`,
        );
    }
    if (change.versionId === null) return;
    if (evidence.evaluationId)
      await requirePassedEvidence(connection, {
        ...change,
        versionId: change.versionId,
        evaluationId: evidence.evaluationId,
      });
    if (!protection || evidence.evaluationId) return;
    if (protection.requirePassedEvaluation)
      throw new DomainError({
        status: 422,
        code: 'alias_evaluation_required',
        message: `to change the protected alias "${change.alias}", specify a passing evaluation of this version (evaluationId)`,
        details: { alias: change.alias },
      });
    if (!evidence.reason?.trim())
      throw new DomainError({
        status: 422,
        code: 'alias_reason_required',
        message: `enter a reason to change the protected alias "${change.alias}" without a passing evaluation`,
        details: { alias: change.alias },
      });
  };
}

/**
 * MLflow互換APIの検査。理由も昇格判定も渡せないので、このAPIからは保護されたaliasを変更も
 * 削除もできない（decisions.md）。ModelVersionや登録モデルを消したときに起きるaliasの削除も同じ。
 */
export const mlflowAliasGuard: ModelAliasGuard = async (connection, change) => {
  if ((await findApplicableAliasProtections(connection, change)).length)
    aliasProtected(
      change.alias,
      `the protected alias "${change.alias}" cannot be changed through the MLflow-compatible API; change it from the Web or the native API with a reason or a passing evaluation`,
    );
};

/**
 * 自動昇格の検査。policyが動くのは、その実行ユーザーがProject adminか全体管理者である間だけで、
 * これはどのrequiredRoleも満たす。このaliasとバージョンに対するpolicyの合格した判定が、保護の
 * 求める根拠になる。権限は登録モデルのロックの下で読み直す。
 */
export function promotionAliasGuard(policy: {
  projectId: string;
  runAsUserId: string;
}): ModelAliasGuard {
  return async (connection, change) => {
    if (!(await hasPromotionRunAsAccess(connection, policy)))
      aliasProtected(
        change.alias,
        `the user running the promotion policy is not allowed to change the protected alias "${change.alias}"`,
      );
  };
}

export class AliasProtectionService {
  constructor(private readonly database: Database) {}

  /** viewerも保護を読める。画面は変更を試みる前にそれを表示する。 */
  async list(
    principal: Principal,
    filter: { projectId: string; modelId?: string },
  ): Promise<ModelAliasProtection[]> {
    await requireProject(this.database, principal, {
      projectId: filter.projectId,
      role: 'viewer',
      scope: 'read',
    });
    return listModelAliasProtections(this.database, filter);
  }

  async set(
    principal: Principal,
    change: AliasProtectionTarget & { input: ModelAliasProtectionInput },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<ModelAliasProtection> {
    const { input, ...target } = change;
    const draft = this.protectionDraft(principal, {
      action: 'model_alias.protection.set',
      target,
      request,
    });
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await this.requireProtectionAdmin(connection, principal, target);
        const protection = await upsertModelAliasProtection(connection, {
          ...target,
          requiredRole: input.requiredRole,
          requirePassedEvaluation: input.requirePassedEvaluation,
          actorUserId: principal.user.id,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          resourceId: protection.id,
          details: { ...draft.details, ...input },
        });
        return protection;
      }),
    );
  }

  async remove(
    principal: Principal,
    target: AliasProtectionTarget,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const draft = this.protectionDraft(principal, {
      action: 'model_alias.protection.delete',
      target,
      request,
    });
    await recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await this.requireProtectionAdmin(connection, principal, target);
        const removed = await deleteModelAliasProtection(connection, target);
        if (!removed) notFound('model alias protection');
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          resourceId: removed.id,
          details: {
            ...draft.details,
            requiredRole: removed.requiredRole,
            requirePassedEvaluation: removed.requirePassedEvaluation,
          },
        });
      }),
    );
  }

  // 昇格policyと同じ規則。Project adminか全体管理者で、tokenならadmin scopeが要る。
  private async requireProtectionAdmin(
    connection: Connection,
    principal: Principal,
    target: AliasProtectionTarget,
  ): Promise<void> {
    await requireProject(connection, principal, {
      projectId: target.projectId,
      role: principal.user.isAdmin ? 'viewer' : 'admin',
      scope: 'admin',
    });
    if (target.modelId)
      await assertProjectReference(connection, {
        table: 'models',
        projectId: target.projectId,
        id: target.modelId,
      });
  }

  private protectionDraft(
    principal: Principal,
    change: { action: string; target: AliasProtectionTarget; request: RequestMetadata },
  ): AuditEventDraft {
    return {
      ...auditActor(principal),
      ...change.request,
      action: change.action,
      resourceType: 'model_alias_protection',
      resourceId: null,
      projectId: change.target.projectId,
      details: { alias: change.target.alias, modelId: change.target.modelId },
    };
  }
}
