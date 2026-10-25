import { randomUUID } from 'node:crypto';
import {
  DEFAULT_JOB_ATTEMPTS,
  type AutomationRuleOwnerTransfer,
  type Job,
  type ModelAutomationExecution,
  type ModelAutomationExecutionPage,
  type ModelAutomationRule,
  type ModelVersion,
  type Run,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Connection, type Database } from '../db/database.js';
import { automationFailureMessage } from '../domain/automationFailure.js';
import { validateCodeCompatibility } from '../domain/compatibility.js';
import { DomainError, notFound } from '../domain/errors.js';
import {
  assertRuleTrigger,
  type AutomationExecutionCreate,
  type AutomationExecutionQuery,
  type ModelAutomationRuleCreate,
} from '../domain/modelAutomationValidation.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import {
  findExecutionForRun,
  type AutomationExecutionRecord,
} from '../repositories/automationExecutionLookup.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findAutomaticRetry,
  findAutomationExecution,
  findAutomationExecutionBoundary,
  findAutomationRule,
  hasAutomationOwnerAccess,
  insertAutomationEvent,
  insertAutomationExecution,
  listAutomationExecutions,
  listAutomationRules,
  lockAutomationRule,
  lockExpiredAutomationEvents,
  lockPendingAutomationEvents,
  lockRegistrationRules,
  measureRuleChain,
  resolveAutomationEvent,
  summarizeRuleAttempts,
  updateAutomationRuleOwner,
  type AutomationExecutionInsert,
  type PendingAutomationEvent,
} from '../repositories/modelAutomationRepository.js';
import { findServiceAccount } from '../repositories/serviceAccountRepository.js';
import {
  assertProjectReference,
  findCodeVersion,
  findModelVersion,
  findRun,
} from '../repositories/registryRepository.js';
import {
  findSavedArtifact,
  validateCodeArtifacts,
} from '../repositories/runtimeArtifactRepository.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import { requireProject } from './accessService.js';
import { auditActor, recordDenial, type AuditEventDraft } from './auditService.js';
import { enqueueAutomationFailure } from './automationFailureNotification.js';
import { assertInputDatasetVersionsUsable } from './datasetVersionReferences.js';
import { notifyListener } from './eventListeners.js';
import type { JobService } from './jobService.js';
import type { RunService } from './runService.js';

// 生成する名前には、ユーザーが作るRunの名前と同じ上限をかける。
const RUN_NAME_LIMIT = 200;

// 保留中の登録が、ルールを動かさずに終わった理由。コードはAPI契約の一部。
const UNSUCCESSFUL_SOURCE_ERRORS = {
  source_unsuccessful: 'source_run_unsuccessful: 学習Runが成功しなかったため起動しません',
  source_timeout:
    'source_run_timeout: 学習Runの成功を期限内に確認できなかったか、学習Runが削除されたため起動しません',
} as const;
type UnsuccessfulSourceState = keyof typeof UNSUCCESSFUL_SOURCE_ERRORS;

const OWNER_ACCESS_REVOKED_ERROR =
  'creator_access_revoked: ルールの実行者（所有者）の管理者権限が失効しています';

// これより長い連鎖は、推論 → 評価 → レポートをはるかに超える。この上限で、設定を誤ったときに
// 1回のモデルの登録から際限なくJobが広がるのを防ぐ。
export const MAX_AUTOMATION_CHAIN_DEPTH = 5;

/**
 * ルールの1回の実行を起動したもの。1段目にはきっかけのRunが無い。連鎖した段は、上流のRun、
 * その出力のDatasetVersion、パイプラインの1段目の実行を受け取る。
 */
export interface AutomationTrigger {
  run: Pick<Run, 'id' | 'outputDatasetVersionIds'> | null;
  pipelineRootExecutionId: string | null;
  source: ModelAutomationExecution['source'];
  attempt: number;
  requestedBy: string | null;
}

/** ルールの後、新しいModelVersionのたびに通知を受ける（triggerがmodel_registeredのフック）。 */
export interface ModelRegistrationListener {
  readonly name: string;
  onModelRegistered(connection: Connection, model: ModelVersion): Promise<void>;
}

const AUTOMATIC_REGISTRATION: AutomationTrigger = {
  run: null,
  pipelineRootExecutionId: null,
  source: 'automatic',
  attempt: 1,
  requestedBy: null,
};

export class ModelAutomationService {
  private readonly database: Database;
  private readonly runs: RunService;
  private readonly jobs: JobService;
  // automation.failedの通知に入れるリンクは、Webの画面を指す。
  private readonly webOrigin: string;
  // 参照で持つ。フックはこのサービスと並ぶサービスから作るので、app.tsが作り終えてから足す。
  private readonly registrationListeners: readonly ModelRegistrationListener[];
  constructor(options: {
    database: Database;
    runs: RunService;
    jobs: JobService;
    webOrigin: string;
    registrationListeners?: readonly ModelRegistrationListener[];
  }) {
    this.database = options.database;
    this.runs = options.runs;
    this.jobs = options.jobs;
    this.webOrigin = options.webOrigin;
    this.registrationListeners = options.registrationListeners ?? [];
  }

  async rules(principal: Principal, projectId: string): Promise<ModelAutomationRule[]> {
    await requireProject(this.database, principal, {
      projectId,
      role: 'viewer',
      scope: 'read',
    });
    return listAutomationRules(this.database, projectId);
  }

  async createRule(
    principal: Principal,
    projectId: string,
    input: ModelAutomationRuleCreate,
  ): Promise<ModelAutomationRule> {
    return transaction(this.database, async (connection) => {
      await this.requireRuleAdmin(connection, principal, projectId);
      // ルールのタグはルールが起動するすべてのRunに写すので、Runのタグと同じ規則に従う。
      assertNoReservedRunTags(input.tags);
      assertRuleTrigger(input);
      if (input.upstreamRuleId !== null)
        await this.assertUpstreamRule(connection, { projectId, ruleId: input.upstreamRuleId });
      await assertProjectReference(connection, {
        table: 'experiments',
        projectId,
        id: input.experimentId,
      });
      await assertInputDatasetVersionsUsable(connection, {
        projectId,
        ids: input.inputDatasetVersionIds,
      });
      const code = await findCodeVersion(connection, {
        projectId,
        id: input.codeVersionId,
      });
      for (const family of input.modelFamilies)
        validateCodeCompatibility(code, {
          model: { family },
          kind: input.kind,
        });
      await validateCodeArtifacts(connection, code);
      await this.jobs.validateTarget(connection, {
        targetId: input.targetId,
        gpuIds: input.gpuIds,
        runtime: code.runtime,
        usage: { userId: principal.user.id },
      });
      const created = (await first<{ id: string }>(
        connection,
        `INSERT INTO model_automation_rules(project_id,name,enabled,model_families,kind,experiment_id,code_version_id,target_id,gpu_ids,input_dataset_version_ids,parameters,tags,max_attempts,created_by,trigger,upstream_rule_id,summary_metrics,run_as_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$14) RETURNING id`,
        [
          projectId,
          input.name,
          input.enabled,
          input.modelFamilies,
          input.kind,
          input.experimentId,
          input.codeVersionId,
          input.targetId,
          input.gpuIds,
          input.inputDatasetVersionIds,
          JSON.stringify(input.parameters),
          JSON.stringify(input.tags),
          input.maxAttempts,
          principal.user.id,
          input.trigger,
          input.upstreamRuleId,
          input.summaryMetrics,
        ],
      ))!;
      return (await findAutomationRule(connection, { projectId, id: created.id }))!;
    });
  }

  // 上流は同じProjectの有効なルールである必要があり、新しいルールは連鎖の深さの上限に
  // 収まる必要がある。
  private async assertUpstreamRule(
    connection: Connection,
    upstream: { projectId: string; ruleId: string },
  ): Promise<void> {
    const rule = await lockAutomationRule(connection, {
      projectId: upstream.projectId,
      id: upstream.ruleId,
      mode: 'share',
    });
    if (!rule) notFound('automation rule');
    if (!rule.enabled)
      throw new DomainError({
        status: 422,
        code: 'upstream_rule_disabled',
        message: 'the upstream rule is disabled',
      });
    const chain = await measureRuleChain(connection, {
      projectId: upstream.projectId,
      ruleId: upstream.ruleId,
      maxDepth: MAX_AUTOMATION_CHAIN_DEPTH,
    });
    if (chain.hasCycle)
      throw new DomainError({
        status: 422,
        code: 'automation_chain_cycle',
        message: 'the rule chain is circular',
      });
    if (chain.depth + 1 > MAX_AUTOMATION_CHAIN_DEPTH)
      throw new DomainError({
        status: 422,
        code: 'automation_chain_too_deep',
        message: `rules can be chained at most ${MAX_AUTOMATION_CHAIN_DEPTH} levels deep`,
        details: { limit: MAX_AUTOMATION_CHAIN_DEPTH },
      });
  }

  async toggleRule(
    principal: Principal,
    projectId: string,
    toggle: { ruleId: string; enabled: boolean },
  ): Promise<ModelAutomationRule> {
    return transaction(this.database, async (connection) => {
      await this.requireRuleAdmin(connection, principal, projectId);
      const toggled = await first(
        connection,
        'UPDATE model_automation_rules SET enabled=$3 WHERE id=$1 AND project_id=$2 RETURNING id',
        [toggle.ruleId, projectId, toggle.enabled],
      );
      if (!toggled) notFound('automation rule');
      return (await findAutomationRule(connection, { projectId, id: toggle.ruleId }))!;
    });
  }

  /**
   * ルールが動くときのユーザーを同じProjectのService Accountに移し、作成者が抜けてもルールが
   * 動き続けるようにする。移す先のアカウントは有効で、Project adminである必要がある。ルールを
   * 動かすにはそれが要るため。created_byには作成者が残る。同じ所有者を設定し直しても何も
   * 変わらず、監査にも再び記録しない。
   */
  async transferOwner(
    principal: Principal,
    projectId: string,
    transfer: { ruleId: string; input: AutomationRuleOwnerTransfer; metadata: RequestMetadata },
  ): Promise<ModelAutomationRule> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...transfer.metadata,
      action: 'automation_rule.owner.transfer',
      resourceType: 'model_automation_rule',
      resourceId: transfer.ruleId,
      projectId,
      details: { serviceAccountId: transfer.input.serviceAccountId },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await this.requireRuleAdmin(connection, principal, projectId);
        const rule = await lockAutomationRule(connection, {
          projectId,
          id: transfer.ruleId,
          mode: 'update',
        });
        if (!rule) notFound('automation rule');
        const serviceAccountId = transfer.input.serviceAccountId;
        const account = await findServiceAccount(connection, { projectId, serviceAccountId });
        if (!account || account.status !== 'active' || account.role !== 'admin')
          throw new DomainError({
            status: 422,
            code: 'invalid_automation_owner',
            message: 'the new owner must be an active service account of the same project (role admin)',
          });
        if (rule.runAsUserId !== serviceAccountId) {
          await updateAutomationRuleOwner(connection, {
            ruleId: rule.id,
            runAsUserId: serviceAccountId,
          });
          await writeAuditEvent(connection, {
            ...draft,
            outcome: 'success',
            details: { ...draft.details, previousRunAsUserId: rule.runAsUserId },
          });
        }
        return (await findAutomationRule(connection, { projectId, id: rule.id }))!;
      }),
    );
  }

  async executions(
    principal: Principal,
    projectId: string,
    query: AutomationExecutionQuery,
  ): Promise<ModelAutomationExecutionPage> {
    await requireProject(this.database, principal, {
      projectId,
      role: 'viewer',
      scope: 'read',
    });
    const filter = { projectId, modelVersionId: query.modelVersionId, ruleId: query.ruleId };
    const after = query.cursor
      ? await findAutomationExecutionBoundary(this.database, { ...filter, id: query.cursor })
      : undefined;
    if (query.cursor && !after) notFound('automation execution cursor');
    const page = await listAutomationExecutions(this.database, {
      ...filter,
      limit: query.limit + 1,
      after,
    });
    const items = page.slice(0, query.limit);
    return { items, nextCursor: page.length > query.limit ? items.at(-1)!.id : null };
  }

  async processRegistration(
    connection: Connection,
    reference: { projectId: string; modelVersionId: string },
  ): Promise<void> {
    const model = await findModelVersion(connection, {
      projectId: reference.projectId,
      id: reference.modelVersionId,
    });
    // registerModelVersionは元のRunにkey-shareのロックをかけているので、この
    // トランザクションが終わるまでRunのstatusは終了状態にならない。まだ動いているRunはこれから
    // 失敗することがあるので、そのバージョンは、終わっていない学習で推論を始めずに
    // AutomationSourceRunHandlerを待つ。
    const sourceRun = model.sourceRunId
      ? await findRun(connection, { projectId: model.projectId, id: model.sourceRunId })
      : null;
    const isPending = sourceRun !== null && !isTerminalStatus(sourceRun.status);
    const isNewEvent = await insertAutomationEvent(connection, {
      modelVersionId: model.id,
      projectId: model.projectId,
      sourceRunId: sourceRun?.id ?? null,
      isPending,
    });
    if (isNewEvent && !isPending) await this.executeEnabledRules(connection, model);
    // 繰り返しの登録や保留中の登録は、listenerがそれぞれ自分で記録する。
    for (const listener of this.registrationListeners)
      await notifyListener(connection, {
        listener: listener.name,
        subjectId: model.id,
        notify: () => listener.onModelRegistered(connection, model),
      });
  }

  // 元のRunが終わった。そのRunが登録したすべてのバージョンについて、今有効なルールを動かす。
  async releasePendingRegistrations(connection: Connection, sourceRunId: string): Promise<void> {
    for (const event of await lockPendingAutomationEvents(connection, sourceRunId)) {
      const model = await findModelVersion(connection, {
        projectId: event.projectId,
        id: event.modelVersionId,
      });
      await this.executeEnabledRules(connection, model);
      await resolveAutomationEvent(connection, {
        modelVersionId: event.modelVersionId,
        state: 'processed',
      });
    }
  }

  async skipPendingRegistrations(connection: Connection, sourceRunId: string): Promise<void> {
    await this.skipRegistrations(connection, {
      events: await lockPendingAutomationEvents(connection, sourceRunId),
      state: 'source_unsuccessful',
    });
  }

  // 期限切れにしたイベントの数を返し、残りがある間はsweeperが続けられるようにする。
  async expirePendingRegistrations(
    connection: Connection,
    expiry: { maxAgeHours: number; limit: number },
  ): Promise<number> {
    const events = await lockExpiredAutomationEvents(connection, expiry);
    await this.skipRegistrations(connection, { events, state: 'source_timeout' });
    return events.length;
  }

  private async skipRegistrations(
    connection: Connection,
    resolution: { events: PendingAutomationEvent[]; state: UnsuccessfulSourceState },
  ): Promise<void> {
    for (const event of resolution.events) {
      const model = await findModelVersion(connection, {
        projectId: event.projectId,
        id: event.modelVersionId,
      });
      for (const rule of await lockRegistrationRules(connection, model)) {
        const execution = {
          id: randomUUID(),
          projectId: model.projectId,
          ruleId: rule.id,
          modelVersionId: model.id,
          status: 'skipped' as const,
          error: UNSUCCESSFUL_SOURCE_ERRORS[resolution.state],
        };
        // 元のRunの失敗は既にrun.failedとして知らせている。新たに知らせるのは期限切れだけ。
        if (resolution.state === 'source_timeout')
          await this.recordUnstarted(connection, { execution, rule, model });
        else await insertAutomationExecution(connection, execution);
      }
      await resolveAutomationEvent(connection, {
        modelVersionId: model.id,
        state: resolution.state,
      });
    }
  }

  private async executeEnabledRules(connection: Connection, model: ModelVersion): Promise<void> {
    for (const rule of await lockRegistrationRules(connection, model))
      await this.executeRule(connection, { rule, model, trigger: AUTOMATIC_REGISTRATION });
  }

  /**
   * 1つのバージョンに1つのルールを起動し、結果を実行として記録する。登録、連鎖した段、手動の
   * 適用で共有する。失敗は投げずに記録するので、呼び出し元のほかのルールと登録そのものは残る。
   * 実行のidを返す。
   */
  async executeRule(
    connection: Connection,
    start: { rule: ModelAutomationRule; model: ModelVersion; trigger: AutomationTrigger },
  ): Promise<string> {
    const { rule, model, trigger } = start;
    const execution = {
      id: randomUUID(),
      projectId: model.projectId,
      ruleId: rule.id,
      modelVersionId: model.id,
      triggerRunId: trigger.run?.id ?? null,
      pipelineRootExecutionId: trigger.pipelineRootExecutionId,
      attempt: trigger.attempt,
      source: trigger.source,
      requestedBy: trigger.requestedBy,
    };
    if (!(await hasAutomationOwnerAccess(connection, rule))) {
      await this.recordUnstarted(connection, {
        execution: { ...execution, status: 'skipped', error: OWNER_ACCESS_REVOKED_ERROR },
        rule,
        model,
      });
      return execution.id;
    }
    if (!model.artifactId && !model.weightsUri) {
      await this.recordUnstarted(connection, {
        execution: {
          ...execution,
          status: 'skipped',
          error: 'weights_required: モデルの重みが指定されていません',
        },
        rule,
        model,
      });
      return execution.id;
    }
    const upstreamOutputIds = trigger.run?.outputDatasetVersionIds ?? [];
    await connection.query('SAVEPOINT automation_rule');
    try {
      if (model.artifactId)
        await findSavedArtifact(connection, {
          projectId: model.projectId,
          artifactId: model.artifactId,
        });
      const run = await this.runs.insertRun(connection, {
        projectId: model.projectId,
        createdBy: rule.runAsUserId,
        input: {
          experimentId: rule.experimentId,
          name: `${rule.name}: ${model.version}`.slice(0, RUN_NAME_LIMIT),
          kind: rule.kind,
          modelVersionId: model.id,
          codeVersionId: rule.codeVersionId,
          inputDatasetVersionIds: [
            ...new Set([...rule.inputDatasetVersionIds, ...upstreamOutputIds]),
          ],
          parameters: rule.parameters,
          tags: {
            ...rule.tags,
            'automation.ruleId': rule.id,
            ...(trigger.pipelineRootExecutionId
              ? { 'automation.pipelineRoot': trigger.pipelineRootExecutionId }
              : {}),
          },
          environment: { automationRuleId: rule.id },
          // 連鎖した段は上流のRunの下にぶら下がる。workerはそのRunをコンテナに渡す。
          parentRunId: trigger.run?.id ?? model.sourceRunId,
        },
        // 評価の条件は、ルールの固定の入力（参照用のセット）だけで照らし合わせる。
        upstreamDatasetVersionIds: upstreamOutputIds,
      });
      const job = await this.jobs.insertJob(connection, {
        run,
        input: {
          runId: run.id,
          targetId: rule.targetId,
          gpuIds: rule.gpuIds,
          // ルールのmaxAttemptsは自動の試行の上限（既定の1は自動で再試行しない）。
          // 人はどちらの上限も超えて、自動実行のJobを手で再試行できる（JobService.retry）。
          maxAttempts: Math.max(rule.maxAttempts, DEFAULT_JOB_ATTEMPTS),
        },
        attempt: 1,
      });
      await insertAutomationExecution(connection, {
        ...execution,
        runId: run.id,
        jobId: job.id,
        status: 'queued',
      });
    } catch (error) {
      await connection.query('ROLLBACK TO SAVEPOINT automation_rule');
      await this.recordUnstarted(connection, {
        execution: { ...execution, status: 'failed', error: automationFailureMessage(error) },
        rule,
        model,
      });
    }
    await connection.query('RELEASE SAVEPOINT automation_rule');
    return execution.id;
  }

  /**
   * 失敗した自動実行のRunの次の試行を始める。失敗した実行を指す新しい実行で、RunとJobはJobの
   * 再試行（retry_of_job_id）で作る。ルールの今の所有者として動き、checkpointから再開することは
   * ない（再開は人が選ぶもの）。その失敗を再試行すべきかは呼び出し元が決める。新しい実行のidを
   * 返す。実行が既に再試行されているか、ルールがこれ以上の試行を許さなければnullを返す。
   */
  async retryExecution(
    connection: Connection,
    failed: { execution: AutomationExecutionRecord; run: Run; job: Job },
  ): Promise<string | null> {
    const { execution, run, job } = failed;
    const rule = await lockAutomationRule(connection, {
      projectId: execution.projectId,
      id: execution.ruleId,
      mode: 'share',
    });
    // 無効にしたルールはそのパイプラインを止める。前に始めたRunの再試行も含む。
    if (!rule?.enabled || execution.attempt >= rule.maxAttempts) return null;
    if (job.attempt >= job.maxAttempts) return null;
    if (await findAutomaticRetry(connection, execution.id)) return null;
    const model = await findModelVersion(connection, {
      projectId: execution.projectId,
      id: execution.modelVersionId,
    });
    const retry = {
      id: randomUUID(),
      projectId: execution.projectId,
      ruleId: rule.id,
      modelVersionId: model.id,
      triggerRunId: execution.triggerRunId,
      pipelineRootExecutionId: execution.pipelineRootExecutionId,
      attempt: execution.attempt + 1,
      source: 'automatic' as const,
      retryOfExecutionId: execution.id,
    };
    if (!(await hasAutomationOwnerAccess(connection, rule))) {
      await this.recordUnstarted(connection, {
        execution: { ...retry, status: 'skipped', error: OWNER_ACCESS_REVOKED_ERROR },
        rule,
        model,
      });
      return retry.id;
    }
    await connection.query('SAVEPOINT automation_retry');
    try {
      const next = await this.jobs.insertRetry(connection, {
        previousJob: job,
        previousRun: run,
        createdBy: rule.runAsUserId,
        checkpointId: null,
      });
      await insertAutomationExecution(connection, {
        ...retry,
        runId: next.run.id,
        jobId: next.job.id,
        status: 'queued',
      });
    } catch (error) {
      await connection.query('ROLLBACK TO SAVEPOINT automation_retry');
      await this.recordUnstarted(connection, {
        execution: { ...retry, status: 'failed', error: automationFailureMessage(error) },
        rule,
        model,
      });
    }
    await connection.query('RELEASE SAVEPOINT automation_retry');
    return retry.id;
  }

  // Runを始めなかった実行は保存し、automation.failedとして知らせる。
  private async recordUnstarted(
    connection: Connection,
    unstarted: {
      execution: AutomationExecutionInsert & {
        id: string;
        status: 'failed' | 'skipped';
        error: string;
      };
      rule: ModelAutomationRule;
      model: ModelVersion;
    },
  ): Promise<void> {
    const { execution } = unstarted;
    await insertAutomationExecution(connection, execution);
    await enqueueAutomationFailure(connection, {
      executionId: execution.id,
      rule: unstarted.rule,
      model: unstarted.model,
      status: execution.status,
      error: execution.error,
      webOrigin: this.webOrigin,
    });
  }

  /**
   * 既存のバージョン（登録のルール）や、終わった上流のRun（連鎖のルール）にルールを手で適用する。
   * たとえば新しいルールで評価のコードを直したあとに使う。できるのはProject adminだけ。この実行は
   * sourceが'manual'の新しい試行として記録する。
   */
  async applyRule(
    principal: Principal,
    projectId: string,
    application: { ruleId: string; input: AutomationExecutionCreate; metadata: RequestMetadata },
  ): Promise<ModelAutomationExecution> {
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...application.metadata,
      action: 'automation.execution.manual',
      resourceType: 'model_automation_rule',
      resourceId: application.ruleId,
      projectId,
      details: { ...application.input },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await this.requireRuleAdmin(connection, principal, projectId);
        const rule = await lockAutomationRule(connection, {
          projectId,
          id: application.ruleId,
          mode: 'update',
        });
        if (!rule) notFound('automation rule');
        if (!rule.enabled)
          throw new DomainError({
            status: 422,
            code: 'automation_rule_disabled',
            message: 'a disabled rule cannot be applied',
          });
        const target = await this.resolveManualTarget(connection, { rule, input: application.input });
        if (!rule.modelFamilies.includes(target.model.family))
          throw new DomainError({
            status: 422,
            code: 'incompatible_model_family',
            message: `the rule does not cover model family ${target.model.family}`,
            details: { modelFamily: target.model.family },
          });
        const attempts = await summarizeRuleAttempts(connection, {
          ruleId: rule.id,
          modelVersionId: target.model.id,
        });
        if (attempts.hasActive)
          throw new DomainError({
            status: 409,
            code: 'automation_execution_active',
            message: 'an execution of the same rule and model version is waiting or running',
          });
        const executionId = await this.executeRule(connection, {
          rule,
          model: target.model,
          trigger: {
            run: target.triggerRun,
            pipelineRootExecutionId: target.pipelineRootExecutionId,
            source: 'manual',
            attempt: attempts.maxAttempt + 1,
            requestedBy: principal.user.id,
          },
        });
        const execution = (await findAutomationExecution(connection, {
          projectId,
          id: executionId,
        }))!;
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            ...draft.details,
            executionId,
            modelVersionId: target.model.id,
            attempt: execution.attempt,
            status: execution.status,
          },
        });
        return execution;
      }),
    );
  }

  private async resolveManualTarget(
    connection: Connection,
    request: { rule: ModelAutomationRule; input: AutomationExecutionCreate },
  ): Promise<{
    model: ModelVersion;
    triggerRun: Run | null;
    pipelineRootExecutionId: string | null;
  }> {
    const { rule, input } = request;
    if ('modelVersionId' in input) {
      if (rule.trigger !== 'model_registered')
        throw new DomainError({
          status: 422,
          code: 'automation_trigger_mismatch',
          message: 'a chained rule requires the ID of the upstream run (triggerRunId)',
        });
      const model = await findModelVersion(connection, {
        projectId: rule.projectId,
        id: input.modelVersionId,
      });
      return { model, triggerRun: null, pipelineRootExecutionId: null };
    }
    if (rule.trigger !== 'upstream_run_finished')
      throw new DomainError({
        status: 422,
        code: 'automation_trigger_mismatch',
        message: 'a rule started by model registration requires the ID of the model version (modelVersionId)',
      });
    const run = await findRun(connection, { projectId: rule.projectId, id: input.triggerRunId });
    if (run.status !== 'finished')
      throw new DomainError({
        status: 422,
        code: 'upstream_run_not_finished',
        message: 'the upstream run has not succeeded',
      });
    const upstream = await findExecutionForRun(connection, {
      projectId: rule.projectId,
      runId: run.id,
    });
    if (!upstream || upstream.ruleId !== rule.upstreamRuleId)
      throw new DomainError({
        status: 422,
        code: 'upstream_rule_mismatch',
        message: 'the given run was not created by the upstream rule of this rule',
      });
    if (run.outputDatasetVersionIds.length === 0)
      throw new DomainError({
        status: 422,
        code: 'upstream_outputs_missing',
        message: 'the upstream run has no output dataset versions',
      });
    const model = await findModelVersion(connection, {
      projectId: rule.projectId,
      id: upstream.modelVersionId,
    });
    return { model, triggerRun: run, pipelineRootExecutionId: upstream.pipelineRootExecutionId };
  }

  private async requireRuleAdmin(
    connection: Connection,
    principal: Principal,
    projectId: string,
  ): Promise<void> {
    // 全体管理者でも、tokenのscope、Projectの制限、tokenの今のmembershipには従う。
    await requireProject(connection, principal, {
      projectId,
      role: principal.user.isAdmin ? 'viewer' : 'admin',
      scope: 'admin',
    });
  }
}
