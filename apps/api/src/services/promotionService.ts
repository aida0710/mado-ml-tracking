import { randomUUID } from 'node:crypto';
import type {
  PromotionEvaluation,
  PromotionEvaluationPage,
  PromotionPolicy,
  Run,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Connection, type Database } from '../db/database.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { evaluateCriteria } from '../domain/promotionCriteria.js';
import { MAX_MODEL_ALIAS_REASON_LENGTH } from '../domain/modelAliasValidation.js';
import { describeCriterionResult } from '../domain/promotionReasonText.js';
import type {
  PromotionEvaluationQuery,
  PromotionPolicyInput,
  PromotionPolicyQuery,
} from '../domain/promotionPolicyValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { findExecutionForRun } from '../repositories/automationExecutionLookup.js';
import {
  assignModelAlias,
  findModelAliasVersion,
  lockModelAliases,
} from '../repositories/modelAliasRepository.js';
import { findServiceAccount } from '../repositories/serviceAccountRepository.js';
import {
  findActiveModelFamily,
  findEvaluationRule,
  findModelIdOfVersion,
  findPromotionEvaluation,
  hasPromotionEvaluation,
  hasPromotionRunAsAccess,
  insertPromotionEvaluation,
  insertPromotionPolicy,
  listPromotionEvaluations,
  listPromotionPolicies,
  lockEnabledPoliciesForRule,
  lockNextEvaluationSequence,
  lockPromotionPolicy,
  lockPromotionPolicyForUpdate,
  promotionEvaluationCursorExists,
  setPromotionPolicyEnabled,
  setPromotionPolicyRunAsUser,
  type PromotionEvaluationRecord,
  type PromotionEvaluationRule,
} from '../repositories/promotionRepository.js';
import { requireProject } from './accessService.js';
import { promotionAliasGuard } from './aliasProtectionService.js';
import { auditActor, NO_REQUEST_METADATA, recordDenial, type AuditEventDraft } from './auditService.js';
import { compareToBaselineInternal } from './evaluationService.js';

const POLICY_SAVEPOINT = 'promotion_policy';
const AUTO_PROMOTION_SAVEPOINT = 'promotion_alias';

type Judgement = Pick<
  PromotionEvaluationRecord,
  'baselineVersionId' | 'baselineRunId' | 'decision' | 'criteriaResults' | 'reason'
>;

function logPromotionFailure(
  event: 'promotion_evaluation_failed' | 'automatic_promotion_failed',
  failure: { policy: PromotionPolicy; candidate: { runId: string }; error: unknown },
): void {
  console.error(
    JSON.stringify({
      event,
      policyId: failure.policy.id,
      runId: failure.candidate.runId,
      message: failure.error instanceof Error ? failure.error.message : String(failure.error),
    }),
  );
}

function skippedJudgement(reason: 'creator_access_revoked' | 'evaluation_error'): Judgement {
  return {
    baselineVersionId: null,
    baselineRunId: null,
    decision: 'skipped',
    criteriaResults: [],
    reason,
  };
}

// 自動昇格が登録モデルのロックを取ったあとも、aliasが変わらずに指していなければならないバージョン。
interface PromotionAliasSnapshot {
  baselineVersionId: string | null;
  targetVersionId: string | null;
}

async function readPromotionAliases(
  connection: Connection,
  policy: PromotionPolicy,
): Promise<PromotionAliasSnapshot> {
  const baselineVersionId = await findModelAliasVersion(connection, {
    modelId: policy.modelId,
    alias: policy.baselineAlias,
  });
  const targetVersionId =
    policy.targetAlias === policy.baselineAlias
      ? baselineVersionId
      : await findModelAliasVersion(connection, {
          modelId: policy.modelId,
          alias: policy.targetAlias,
        });
  return { baselineVersionId, targetVersionId };
}

/** aliasのイベントの理由。どのpolicyが、どの数値でバージョンを合格にしたか。 */
function automaticPromotionReason(policy: PromotionPolicy, judgement: Judgement): string {
  const firstRelease = judgement.reason === 'baseline_missing_first_promotion' ? '（基準バージョンなし）' : '';
  const reason = `昇格policy「${policy.name}」の合格判定による自動昇格${firstRelease}: ${judgement.criteriaResults
    .map(describeCriterionResult)
    .join(', ')}`;
  return reason.slice(0, MAX_MODEL_ALIAS_REASON_LENGTH);
}

/**
 * 候補のRunを、policyのルールのもとで基準と比べる。両方とも、そのルールの自動実行が作ったRunに
 * 限り、条件はルールが固定した参照セットと評価のCodeVersionとする。そのため、手で作った評価Runは
 * 判定されることも、基準になることもない。
 */
async function judgeCandidate(
  connection: Connection,
  judged: {
    policy: PromotionPolicy;
    rule: PromotionEvaluationRule;
    candidate: { versionId: string; runId: string };
  },
): Promise<Judgement> {
  const { policy, rule, candidate } = judged;
  const comparison = await compareToBaselineInternal(connection, policy.projectId, {
    modelId: policy.modelId,
    candidateVersionId: candidate.versionId,
    candidateRunId: candidate.runId,
    baselineAlias: policy.baselineAlias,
    referenceDatasetVersionIds: rule.inputDatasetVersionIds,
    codeVersionId: rule.codeVersionId,
    evaluationRuleId: policy.evaluationRuleId,
    metrics: [...new Set(policy.criteria.map((criterion) => criterion.metric))],
  });
  return {
    baselineVersionId: comparison.baselineVersionId,
    baselineRunId: comparison.baselineRunId,
    ...evaluateCriteria(comparison, policy.criteria, policy.missingBaseline),
  };
}

export class PromotionService {
  constructor(private readonly database: Database) {}

  async policies(
    principal: Principal,
    projectId: string,
    query: PromotionPolicyQuery,
  ): Promise<PromotionPolicy[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return listPromotionPolicies(this.database, { projectId, modelId: query.modelId });
  }

  async createPolicy(
    principal: Principal,
    projectId: string,
    input: PromotionPolicyInput,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<PromotionPolicy> {
    const draft = this.policyDraft(principal, {
      action: 'promotion.policy.create',
      projectId,
      resourceId: null,
      request,
    });
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await this.requirePolicyAdmin(connection, principal, projectId);
        await this.validatePolicyReferences(connection, { projectId, input });
        const policy = await insertPromotionPolicy(connection, {
          projectId,
          input,
          createdBy: principal.user.id,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          resourceId: policy.id,
          details: {
            name: policy.name,
            modelId: policy.modelId,
            evaluationRuleId: policy.evaluationRuleId,
            targetAlias: policy.targetAlias,
            baselineAlias: policy.baselineAlias,
            autoPromote: policy.autoPromote,
          },
        });
        return policy;
      }),
    );
  }

  async setPolicyEnabled(
    principal: Principal,
    change: { projectId: string; policyId: string; enabled: boolean },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<PromotionPolicy> {
    const { projectId, policyId, enabled } = change;
    const draft = this.policyDraft(principal, {
      action: 'promotion.policy.update',
      projectId,
      resourceId: policyId,
      request,
    });
    return recordDenial(this.database, { ...draft, details: { enabled } }, () =>
      transaction(this.database, async (connection) => {
        await this.requirePolicyAdmin(connection, principal, projectId);
        const policy = await setPromotionPolicyEnabled(connection, {
          projectId,
          id: policyId,
          enabled,
        });
        if (!policy) notFound('promotion policy');
        await writeAuditEvent(connection, { ...draft, outcome: 'success', details: { enabled } });
        return policy;
      }),
    );
  }

  /**
   * policyをProjectのService Accountとして動かし、人の所有者が抜けたあとも判定と自動昇格が続く
   * ようにする。そのアカウントは有効で、adminのroleを持っていなければならない。判定のたびに
   * 確かめ直すのはこの権限。今の所有者をもう一度指定しても何も変わらない。
   */
  async transferPolicyOwner(
    principal: Principal,
    change: { projectId: string; policyId: string; serviceAccountId: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<PromotionPolicy> {
    const { projectId, policyId, serviceAccountId } = change;
    const draft = this.policyDraft(principal, {
      action: 'promotion_policy.owner.transfer',
      projectId,
      resourceId: policyId,
      request,
    });
    return recordDenial(this.database, { ...draft, details: { serviceAccountId } }, () =>
      transaction(this.database, async (connection) => {
        await this.requirePolicyAdmin(connection, principal, projectId);
        const policy = await lockPromotionPolicyForUpdate(connection, { projectId, id: policyId });
        if (!policy) notFound('promotion policy');
        const account = await findServiceAccount(connection, { projectId, serviceAccountId });
        if (!account || account.status !== 'active' || account.role !== 'admin')
          throw new DomainError({
            status: 422,
            code: 'promotion_owner_invalid',
            message: 'the new owner must be an active service account of this project (role admin)',
          });
        if (policy.runAsUserId === account.id) return policy;
        const updated = await setPromotionPolicyRunAsUser(connection, {
          projectId,
          id: policyId,
          runAsUserId: account.id,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { previousRunAsUserId: policy.runAsUserId, runAsUserId: account.id },
        });
        return updated;
      }),
    );
  }

  async evaluations(
    principal: Principal,
    projectId: string,
    query: PromotionEvaluationQuery,
  ): Promise<PromotionEvaluationPage> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    if (
      query.cursor &&
      !(await promotionEvaluationCursorExists(this.database, { projectId, id: query.cursor }))
    )
      notFound('promotion evaluation cursor');
    // 1行多く取り、件数を数えるクエリなしで次のページがあるかを知る。
    const items = await listPromotionEvaluations(this.database, {
      ...query,
      projectId,
      limit: query.limit + 1,
    });
    const page = items.slice(0, query.limit);
    return { items: page, nextCursor: items.length > query.limit ? page.at(-1)!.id : null };
  }

  /**
   * 同じ候補のRunを同じpolicyでもう一度判定し、結果を次のsequenceとして足す。実行ユーザーの
   * 権限の代わりに、リクエストした人の今のProject adminの権限を使う。
   */
  async reevaluate(
    principal: Principal,
    reference: { projectId: string; evaluationId: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<PromotionEvaluation> {
    const { projectId, evaluationId } = reference;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'promotion.evaluation.reevaluate',
      resourceType: 'promotion_evaluation',
      resourceId: evaluationId,
      projectId,
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await this.requirePolicyAdmin(connection, principal, projectId);
        const previous = await findPromotionEvaluation(connection, { projectId, id: evaluationId });
        if (!previous) notFound('promotion evaluation');
        const policy = (await lockPromotionPolicy(connection, {
          projectId,
          id: previous.policyId,
        }))!;
        const rule = (await findEvaluationRule(connection, {
          projectId,
          id: policy.evaluationRuleId,
        }))!;
        const sequence = await lockNextEvaluationSequence(connection, {
          policyId: policy.id,
          candidateRunId: previous.candidateRunId,
        });
        const judgement = await judgeCandidate(connection, {
          policy,
          rule,
          candidate: { versionId: previous.candidateVersionId, runId: previous.candidateRunId },
        });
        const id = await insertPromotionEvaluation(connection, {
          projectId,
          policyId: policy.id,
          candidateVersionId: previous.candidateVersionId,
          candidateRunId: previous.candidateRunId,
          ...judgement,
          sequence,
          requestedBy: principal.user.id,
        });
        if (!id) conflict('the same evaluation was re-run at the same time');
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            policyId: policy.id,
            candidateRunId: previous.candidateRunId,
            previousEvaluationId: previous.id,
            evaluationId: id,
            sequence,
            decision: judgement.decision,
          },
        });
        return (await findPromotionEvaluation(connection, { projectId, id }))!;
      }),
    );
  }

  /**
   * 評価Runをfinishedへ移したトランザクションの中で呼ばれる。判定するのは自動実行ルールが作った
   * Run（そのJobを手で再試行したものを含む）だけで、そのルールとRunの登録モデルの有効なpolicyで
   * 判定する。policyごとの失敗はskippedとして記録し、例外にしない。そのため、Runの終了状態と
   * outboxのイベントは失敗にかかわらずコミットされる。あるpolicyで判定済みのRun（開き直して
   * もう一度終えたMLflowのRun）は判定し直さない。再評価は明示的に行う。autoPromoteのpolicyで
   * 合格すると、そのtargetAliasも動かす（recordWithAutomaticPromotion）。
   */
  async processFinishedRun(connection: Connection, run: Run): Promise<void> {
    if (run.kind !== 'evaluation' || run.status !== 'finished' || !run.modelVersionId) return;
    const { projectId } = run;
    const execution = await findExecutionForRun(connection, { projectId, runId: run.id });
    if (!execution) return;
    const modelId = await findModelIdOfVersion(connection, {
      projectId,
      versionId: run.modelVersionId,
    });
    if (!modelId) return;
    const policies = await lockEnabledPoliciesForRule(connection, {
      projectId,
      evaluationRuleId: execution.ruleId,
      modelId,
    });
    if (!policies.length) return;
    const rule = (await findEvaluationRule(connection, { projectId, id: execution.ruleId }))!;
    for (const policy of policies)
      await this.judgeFinishedRun(connection, {
        policy,
        rule,
        candidate: { versionId: run.modelVersionId, runId: run.id },
      });
  }

  private async judgeFinishedRun(
    connection: Connection,
    judged: {
      policy: PromotionPolicy;
      rule: PromotionEvaluationRule;
      candidate: { versionId: string; runId: string };
    },
  ): Promise<void> {
    const { policy, candidate } = judged;
    const reference = { policyId: policy.id, candidateRunId: candidate.runId };
    if (await hasPromotionEvaluation(connection, reference)) return;
    // 判定の前に読む。ここより後に手での変更がコミットされたら、昇格を止めなければならない。
    const aliasesAtJudgement = policy.autoPromote
      ? await readPromotionAliases(connection, policy)
      : null;
    await connection.query(`SAVEPOINT ${POLICY_SAVEPOINT}`);
    let judgement: Judgement;
    try {
      judgement = (await hasPromotionRunAsAccess(connection, policy))
        ? await judgeCandidate(connection, judged)
        : skippedJudgement('creator_access_revoked');
    } catch (error) {
      await connection.query(`ROLLBACK TO SAVEPOINT ${POLICY_SAVEPOINT}`);
      logPromotionFailure('promotion_evaluation_failed', { policy, candidate, error });
      judgement = skippedJudgement('evaluation_error');
    }
    await connection.query(`RELEASE SAVEPOINT ${POLICY_SAVEPOINT}`);
    const record: PromotionEvaluationRecord = {
      projectId: policy.projectId,
      policyId: policy.id,
      candidateVersionId: candidate.versionId,
      candidateRunId: candidate.runId,
      ...judgement,
      sequence: 1,
      requestedBy: null,
    };
    if (aliasesAtJudgement && judgement.decision === 'passed')
      await this.recordWithAutomaticPromotion(connection, {
        policy,
        record,
        judgement,
        aliasesAtJudgement,
      });
    else await insertPromotionEvaluation(connection, record);
  }

  /**
   * 1つのsavepointの中で、targetAliasを合格した候補へ動かし、判定をaliasのイベントと一緒に
   * 記録する。登録モデルのロックの下で、基準と昇格先のaliasが判定のときと同じバージョンを指して
   * いなければならない。並行した手での変更があればそちらを優先し、判定にはbaseline_changedを
   * 記録する。候補が既にtargetAliasを持っていれば何も変えない。変更が拒まれた場合（aliasの保護の
   * もとでの実行ユーザーの権限による）はpromotion_deniedを記録する。昇格するのは自動の判定だけで、
   * 再評価ではaliasを動かすのを人に任せる（PromotionDialog）。
   */
  private async recordWithAutomaticPromotion(
    connection: Connection,
    promotion: {
      policy: PromotionPolicy;
      record: PromotionEvaluationRecord;
      judgement: Judgement;
      aliasesAtJudgement: PromotionAliasSnapshot;
    },
  ): Promise<void> {
    const { policy, record, judgement, aliasesAtJudgement } = promotion;
    await connection.query(`SAVEPOINT ${AUTO_PROMOTION_SAVEPOINT}`);
    try {
      await lockModelAliases(connection, policy.modelId);
      const current = await readPromotionAliases(connection, policy);
      const unchanged =
        current.baselineVersionId === judgement.baselineVersionId &&
        current.targetVersionId === aliasesAtJudgement.targetVersionId;
      if (!unchanged || current.targetVersionId === record.candidateVersionId) {
        await insertPromotionEvaluation(connection, {
          ...record,
          reason: unchanged ? record.reason : 'baseline_changed',
        });
        await connection.query(`RELEASE SAVEPOINT ${AUTO_PROMOTION_SAVEPOINT}`);
        return;
      }
      // aliasのイベントは、まだ存在しないこの判定を指す。その外部キーは遅延させてある。
      // このロックの下ではaliasは別のバージョンを指しているので、割り当ては必ずイベントを記録する。
      const evaluationId = randomUUID();
      const aliasEventId = (await assignModelAlias(connection, {
        modelId: policy.modelId,
        alias: policy.targetAlias,
        versionId: record.candidateVersionId,
        actor: { userId: policy.runAsUserId, tokenId: null },
        source: 'promotion_policy',
        reason: automaticPromotionReason(policy, judgement),
        evaluationId,
        guard: promotionAliasGuard(policy),
      }))!;
      // 同じRunを並行して判定した側が、既に結果を記録している。このaliasの移動を取り消す。
      const recorded = await insertPromotionEvaluation(connection, {
        ...record,
        promotion: { id: evaluationId, aliasEventId },
      });
      if (!recorded) await connection.query(`ROLLBACK TO SAVEPOINT ${AUTO_PROMOTION_SAVEPOINT}`);
      await connection.query(`RELEASE SAVEPOINT ${AUTO_PROMOTION_SAVEPOINT}`);
    } catch (error) {
      await connection.query(`ROLLBACK TO SAVEPOINT ${AUTO_PROMOTION_SAVEPOINT}`);
      await connection.query(`RELEASE SAVEPOINT ${AUTO_PROMOTION_SAVEPOINT}`);
      logPromotionFailure('automatic_promotion_failed', {
        policy,
        candidate: { runId: record.candidateRunId },
        error,
      });
      await insertPromotionEvaluation(connection, { ...record, reason: 'promotion_denied' });
    }
  }

  private async validatePolicyReferences(
    connection: Connection,
    policy: { projectId: string; input: PromotionPolicyInput },
  ): Promise<void> {
    const { projectId, input } = policy;
    const family = await findActiveModelFamily(connection, { projectId, id: input.modelId });
    if (!family) notFound('model');
    const rule = await findEvaluationRule(connection, { projectId, id: input.evaluationRuleId });
    if (!rule) notFound('automation rule');
    if (rule.kind !== 'evaluation')
      throw new DomainError({
        status: 422,
        code: 'promotion_rule_not_evaluation',
        message: 'the evaluation rule must be an automation rule of kind evaluation',
      });
    // この登録モデルのfamilyで動かないルールでは、policyに候補が来ない。
    if (!rule.modelFamilies.includes(family))
      throw new DomainError({
        status: 422,
        code: 'promotion_rule_family_mismatch',
        message: 'the model families of the evaluation rule do not include the family of the model',
      });
  }

  private policyDraft(
    principal: Principal,
    change: {
      action: string;
      projectId: string;
      resourceId: string | null;
      request: RequestMetadata;
    },
  ): AuditEventDraft {
    return {
      ...auditActor(principal),
      ...change.request,
      action: change.action,
      resourceType: 'promotion_policy',
      resourceId: change.resourceId,
      projectId: change.projectId,
    };
  }

  // 自動実行ルールと同じ規則。Project adminか全体管理者で、tokenならadmin scopeが要る。
  private async requirePolicyAdmin(
    connection: Connection,
    principal: Principal,
    projectId: string,
  ): Promise<void> {
    await requireProject(connection, principal, {
      projectId,
      role: principal.user.isAdmin ? 'viewer' : 'admin',
      scope: 'admin',
    });
  }
}
