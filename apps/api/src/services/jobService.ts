import { randomUUID } from 'node:crypto';
import {
  JOB_SUBMISSION_PHASES,
  MAX_JOB_ATTEMPTS,
  type ComputeTarget,
  type ExecutionRuntime,
  type Job,
  type JobListItem,
  type Run,
  type TaskExecution,
  type WorkerJob,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import type { ApiConfig } from '../config.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { validateCodeCompatibility } from '../domain/compatibility.js';
import { validateExecutionSnapshot } from '../domain/executionSnapshot.js';
import {
  validatePinnedRuntime,
  validateTargetCompatibility,
} from '../domain/runtimeCompatibility.js';
import { validateCodeArtifacts } from '../repositories/runtimeArtifactRepository.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { assertControlsJob } from '../domain/jobControl.js';
import { requiredWorkerCapabilitiesSql } from '../domain/workerCapabilities.js';
import type { JobCreate, JobLaunch } from '../domain/validation.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import { initialJobPhase, validateSiteJobOptions } from '../domain/siteJobs.js';
import {
  findCodeVersion,
  findDatasetVersions,
  findModelVersion,
  findRun,
} from '../repositories/registryRepository.js';
import { findJob, jobColumns } from '../repositories/jobRepository.js';
import { findOriginStepExecutionOfRun } from '../repositories/workflowExecutionRepository.js';
import { shareLiveProject } from '../repositories/projectRepository.js';
import { findExecutionForRun } from '../repositories/automationExecutionLookup.js';
import { requireProject, requireScope } from './accessService.js';
import { JobTokenService } from './jobTokenService.js';
import { assertTargetReadyForJobs } from './siteReadiness.js';
import { NO_IMAGE_PLATFORM_CHECK, type ImagePlatformChecker } from './imagePlatformChecker.js';
import type { RunCompletionService } from './runCompletionService.js';
import type { RunService } from './runService.js';
import { runColumns } from '../repositories/runListProjection.js';
import { SWEEP_EARLY_STOPPED_TAG } from './sweepController.js';
import type { JobRetryInput } from '../domain/checkpointValidation.js';
import {
  findWorkerInputCheckpoint,
  findWorkerResumeCheckpoint,
  pinResumeCheckpoint,
  selectRetryCheckpoint,
} from './checkpointResume.js';
import { findTriggerPayload } from '../repositories/hookExecutionRepository.js';

/**
 * 呼び出し元が決めるJobの項目。JobCreateのリクエストか、Task・ルール・フック・ドライバーの起動。
 */
export type JobInsert = Pick<JobCreate, 'runId' | 'targetId' | 'gpuIds' | 'maxAttempts'> &
  Partial<
    Pick<
      JobCreate,
      'gpuCount' | 'walltimeSeconds' | 'retryOnFailure' | 'retryOnTimeout' | 'allowChildJobs'
    >
  >;

/** ほかのJobとの関係でのJobの位置。サーバーだけが設定する（array、フック、ドライバー）。 */
export interface JobPlacement {
  arrayGroupId?: string;
  arrayIndex?: number;
  hookId?: string | null;
  hookChain?: string[];
  parentJobId?: string | null;
  chainDepth?: number;
  datasetPartitionVersionId?: string | null;
  idempotencyKey?: string | null;
}

/**
 * maxAttemptsが制限するのは自動の再試行だけ（呼び出し元が確かめる）。フックと自動実行ルールが
 * 約束しているとおり、人はそれを超えてJobを再試行できる。それでも連鎖には上限を置き、再試行を
 * 元の自動実行までたどる検索が終わるようにする。
 */
function assertRetryable(job: Job): void {
  if (!isTerminalStatus(job.status)) conflict('a running job or a job of unknown status cannot be retried');
  if (job.attempt >= MAX_JOB_ATTEMPTS)
    conflict(`a job can be retried up to attempt ${MAX_JOB_ATTEMPTS}`, { maxAttempts: MAX_JOB_ATTEMPTS });
}

/**
 * 再試行のRunの親。自動実行のRunの親はその上流（学習Run、上流の段、または無し）で、workerが
 * コンテナに渡すので、その再試行も同じ親を保つ。それ以外の再試行は、再試行するRunの下に
 * ぶら下がる。
 */
async function retryParentRunId(connection: Connection, previousRun: Run): Promise<string | null> {
  const execution = await findExecutionForRun(connection, {
    projectId: previousRun.projectId,
    runId: previousRun.id,
  });
  return execution ? previousRun.parentRunId : previousRun.id;
}

export class JobService {
  private readonly database: Database;
  private readonly runs: RunService;
  private readonly config: ApiConfig;
  private readonly runCompletion: RunCompletionService;
  private readonly jobTokens: JobTokenService;
  private readonly imagePlatforms: ImagePlatformChecker;
  constructor(options: {
    database: Database;
    runs: RunService;
    config: ApiConfig;
    runCompletion: RunCompletionService;
    jobTokens?: JobTokenService;
    imagePlatforms?: ImagePlatformChecker;
  }) {
    this.database = options.database;
    this.runs = options.runs;
    this.config = options.config;
    this.runCompletion = options.runCompletion;
    this.jobTokens = options.jobTokens ?? new JobTokenService(options.database);
    this.imagePlatforms = options.imagePlatforms ?? NO_IMAGE_PLATFORM_CHECK;
  }

  /** ProjectのJob。新しい順。`runId`を指定するとそのRunのものだけ。 */
  async list(
    principal: Principal,
    projectId: string,
    filter: { runId?: string } = {},
  ): Promise<JobListItem[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    // どのJobにも同じProjectのRunがある。Taskは無いこともある。Sweepのtrial、自動実行の実行、
    // ワークフローのstepは自分が始めたJobを指しているので、それを人が再試行したJobには起点が無い。
    // 前の実行のRunを使い回すワークフローのstepは、そのJobを始めていない。
    return rows(
      this.database,
      `SELECT ${jobColumns('j')},r.name AS run_name,r.kind AS run_kind,r.task_id,t.name AS task_name,
        COALESCE(r.tags->>$2='true',false) AS sweep_early_stopped,
        r.created_by,u.display_name AS created_by_name,
        (r.resume_checkpoint_id IS NOT NULL
          OR EXISTS(SELECT 1 FROM run_checkpoints c WHERE c.run_id=r.id AND c.project_id=r.project_id))
          AS has_resume_checkpoint,
        CASE WHEN s.id IS NULL THEN NULL ELSE
          jsonb_build_object('sweepId',s.id,'sweepName',s.name,'trialIndex',st.trial_index) END
          AS sweep_trial,
        CASE WHEN rule.id IS NULL THEN NULL ELSE
          jsonb_build_object('ruleId',rule.id,'ruleName',rule.name) END AS automation_rule,
        CASE WHEN workflow_step.execution_id IS NULL THEN NULL ELSE
          jsonb_build_object('workflowId',workflow_step.workflow_id,
            'executionId',workflow_step.execution_id) END AS workflow_execution,
        ${requiredWorkerCapabilitiesSql('r')} AS required_worker_capabilities
      FROM jobs j JOIN runs r ON r.id=j.run_id
      LEFT JOIN experiment_tasks t ON t.id=r.task_id
      LEFT JOIN users u ON u.id=r.created_by
      LEFT JOIN sweep_trials st ON st.job_id=j.id AND st.project_id=j.project_id
      LEFT JOIN sweeps s ON s.id=st.sweep_id AND s.project_id=st.project_id
      LEFT JOIN LATERAL (
        SELECT ar.id,ar.name FROM model_automation_executions e
        JOIN model_automation_rules ar ON ar.id=e.rule_id AND ar.project_id=e.project_id
        WHERE e.job_id=j.id AND e.project_id=j.project_id LIMIT 1
      ) rule ON true
      LEFT JOIN LATERAL (
        SELECT step.execution_id,execution.workflow_id FROM workflow_step_runs step
        JOIN workflow_executions execution ON execution.id=step.execution_id
        WHERE step.job_id=j.id AND NOT step.reused LIMIT 1
      ) workflow_step ON true
      WHERE j.project_id=$1 AND ($3::uuid IS NULL OR j.run_id=$3) ORDER BY j.created_at DESC`,
      [projectId, SWEEP_EARLY_STOPPED_TAG, filter.runId ?? null],
    );
  }

  async create(principal: Principal, projectId: string, input: JobCreate): Promise<Job> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'jobs:write',
      });
      const run = await findRun(connection, { projectId, id: input.runId, lock: true });
      return this.insertJob(connection, { run, input, attempt: 1 });
    });
  }

  /**
   * Taskの起動と同じく、RunとそのJobを一緒に作る。Jobが拒まれたら（たとえばJobを受け付けない
   * コンピュータ）Runも残さないので、来ないJobを待ち続けるqueuedのRunはできない。tokenには
   * runs:writeとjobs:writeが要る。
   */
  async launch(principal: Principal, projectId: string, input: JobLaunch): Promise<TaskExecution> {
    assertNoReservedRunTags(input.run.tags);
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      requireScope(principal, 'jobs:write');
      const insertedRun = await this.runs.insertRun(connection, {
        projectId,
        createdBy: principal.user.id,
        input: input.run,
      });
      const run = input.run.resumeCheckpointId
        ? await pinResumeCheckpoint(connection, {
            run: insertedRun,
            checkpointId: input.run.resumeCheckpointId,
          })
        : insertedRun;
      const job = await this.insertJob(connection, {
        run,
        input: { ...input.job, runId: run.id },
        attempt: 1,
      });
      return { run, job };
    });
  }

  async insertJob(
    connection: Connection,
    registration: { run: Run; input: JobInsert; attempt: number; placement?: JobPlacement },
  ): Promise<Job> {
    const { run, input, attempt } = registration;
    const placement = registration.placement ?? {};
    // 人、フック、自動実行、Sweepのどれが始めるJobも、すべてここを通る。アーカイブ済みのProjectには
    // 作らず、このロックを待っていたアーカイブは、そのあとで新しいJobを見る。
    if (!(await shareLiveProject(connection, run.projectId))) notFound('project');
    const activeRun = await first(
      connection,
      "SELECT id FROM runs WHERE id=$1 AND project_id=$2 AND lifecycle_stage='active'",
      [run.id, run.projectId],
    );
    if (!activeRun) conflict('jobs cannot be created for a deleted run');
    if (run.status !== 'queued') conflict('jobs can be created only for queued runs');
    // 重複はコンピュータをロックする前に拒む。workerは、この既存のRunより先に
    // コンピュータをロックする。
    const existing = await first(connection, 'SELECT id FROM jobs WHERE run_id=$1', [run.id]);
    if (existing) conflict('the run already has a job');
    if (!run.codeVersionId)
      throw new DomainError({
        status: 422,
        code: 'code_required',
        message: 'a code version to run is required',
      });
    const code = await findCodeVersion(connection, {
      projectId: run.projectId,
      id: run.codeVersionId,
    });
    const model = run.modelVersionId
      ? await findModelVersion(connection, { projectId: run.projectId, id: run.modelVersionId })
      : null;
    validateCodeCompatibility(code, { model, kind: run.kind });
    validatePinnedRuntime(code.runtime, run.environment.runtime);
    validateExecutionSnapshot(code, run);
    await validateCodeArtifacts(connection, code);
    await findDatasetVersions(connection, {
      projectId: run.projectId,
      ids: run.inputDatasetVersionIds,
    });
    const target = await this.validateTarget(connection, {
      targetId: input.targetId,
      gpuIds: input.gpuIds,
      gpuCount: input.gpuCount,
      retryOnFailure: input.retryOnFailure,
      retryOnTimeout: input.retryOnTimeout,
      runtime: code.runtime,
      usage: { userId: run.createdBy },
    });
    // sshとlocalのJobはGPUを指定する。siteのJobは数だけを求める。
    const gpuCount = target.executor === 'site' ? (input.gpuCount ?? 0) : input.gpuIds.length;
    return (await first<Job>(
      connection,
      `INSERT INTO jobs(project_id,run_id,target_id,gpu_ids,max_attempts,attempt,phase,gpu_count,walltime_seconds,
        retry_on_failure,retry_on_timeout,allow_child_jobs,array_group_id,array_index,hook_id,hook_chain,
        parent_job_id,chain_depth,dataset_partition_version_id,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING ${jobColumns()}`,
      [
        run.projectId,
        run.id,
        input.targetId,
        input.gpuIds,
        input.maxAttempts,
        attempt,
        initialJobPhase(target),
        gpuCount,
        input.walltimeSeconds ?? null,
        input.retryOnFailure ?? false,
        input.retryOnTimeout ?? false,
        input.allowChildJobs ?? false,
        placement.arrayGroupId ?? null,
        placement.arrayIndex ?? null,
        placement.hookId ?? null,
        placement.hookChain ?? [],
        placement.parentJobId ?? null,
        placement.chainDepth ?? 0,
        placement.datasetPartitionVersionId ?? null,
        placement.idempotencyKey ?? null,
      ],
    ))!;
  }

  /**
   * `usage`は、Jobを誰として動かすか。Runの作成者（ルール・フック・Task・Sweepの所有者）で、
   * そのユーザーがコンピュータを使える必要がある。
   */
  async validateTarget(
    connection: Connection,
    execution: {
      targetId: string;
      gpuIds: string[];
      runtime: ExecutionRuntime;
      gpuCount?: number;
      retryOnFailure?: boolean;
      retryOnTimeout?: boolean;
      usage: { userId: string };
    },
  ): Promise<ComputeTarget> {
    const target = await first<ComputeTarget>(
      connection,
      'SELECT * FROM compute_targets WHERE id=$1 AND enabled=true FOR SHARE',
      [execution.targetId],
    );
    if (!target) notFound('computer');
    validateTargetCompatibility(target, {
      runtime: execution.runtime,
      gpuIds: execution.gpuIds,
      allowLocalExecutor: this.config.allowLocalExecutor,
    });
    validateSiteJobOptions(target, {
      gpuCount: execution.gpuCount ?? 0,
      retryOnFailure: execution.retryOnFailure ?? false,
      retryOnTimeout: execution.retryOnTimeout ?? false,
    });
    // 別のCPU向けのイメージは、キューで待ったあとに計算ノードで初めて失敗する。
    await this.imagePlatforms.assertRunsOn(execution.runtime, target);
    await assertTargetReadyForJobs(connection, { target, ...execution.usage });
    return target;
  }

  async cancel(principal: Principal, projectId: string, jobId: string): Promise<Job> {
    return transaction(this.database, async (connection) => {
      const role = await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'jobs:write',
      });
      const job = await findJob(connection, { projectId, id: jobId });
      const run = await findRun(connection, { projectId, id: job.runId });
      assertControlsJob({ role, userId: principal.user.id }, run);
      return this.requestCancelInTransaction(connection, { projectId, jobId });
    });
  }

  /**
   * 取り消しのAPIとサーバー側の取り消し（Sweep）で共有する。権限の確認は呼び出し元が行う。
   * ドライバーの終わっていない子のJobも一緒に取り消し、止めた親のために動き続けるものが
   * 残らないようにする。
   */
  async requestCancelInTransaction(
    connection: Connection,
    reference: { projectId: string; jobId: string },
  ): Promise<Job> {
    const job = await this.cancelOne(connection, reference);
    const children = await rows<{ id: string }>(
      connection,
      `SELECT id FROM jobs WHERE parent_job_id=$1 AND status IN ('queued','claimed','running')
      ORDER BY created_at,id`,
      [job.id],
    );
    for (const child of children)
      await this.requestCancelInTransaction(connection, {
        projectId: reference.projectId,
        jobId: child.id,
      });
    return job;
  }

  private async cancelOne(
    connection: Connection,
    reference: { projectId: string; jobId: string },
  ): Promise<Job> {
    const { projectId } = reference;
    const job = await findJob(connection, { projectId, id: reference.jobId, lock: true });
    if (isTerminalStatus(job.status)) return job;
    // 投入中か、スケジューラのキューで待っているsiteのJobはまだ何も動かしていないので、ここで
    // 終える。キューに入ったスケジューラのジョブはlauncherが消す（scheduler_cancel_state）。
    const waitsInSchedulerQueue = !!job.phase && JOB_SUBMISSION_PHASES.includes(job.phase);
    if (job.status !== 'queued' && !waitsInSchedulerQueue) {
      // 応答の無いworkerでも、リモートで動くプロセスをまだ持っていることがある。
      // 予約を解くのは完了したときだけ。
      return (await first<Job>(
        connection,
        `UPDATE jobs SET cancel_requested=true WHERE id=$1 RETURNING ${jobColumns()}`,
        [job.id],
      ))!;
    }
    const previousRun = await findRun(connection, { projectId, id: job.runId, lock: true });
    const canceled = (await first<Job>(
      connection,
      `UPDATE jobs SET status='canceled',cancel_requested=true,ended_at=now(),
        scheduler_cancel_state=CASE WHEN scheduler_job_id IS NULL THEN NULL ELSE 'pending' END
      WHERE id=$1 RETURNING ${jobColumns()}`,
      [job.id],
    ))!;
    const run = (await first<Run>(
      connection,
      `UPDATE runs SET status='canceled',ended_at=now() WHERE id=$1 RETURNING ${runColumns}`,
      [job.runId],
    ))!;
    await this.runCompletion.recordStatusChange(connection, {
      previousStatus: previousRun.status,
      run,
    });
    return canceled;
  }

  /** 再試行は新しいRun。checkpointを指定すると、step 0からではなくそのstepから続ける。 */
  async retry(
    principal: Principal,
    projectId: string,
    request: { jobId: string; input: JobRetryInput },
  ): Promise<{ run: Run; job: Job }> {
    const { jobId, input: retryRequest } = request;
    return transaction(this.database, async (connection) => {
      const role = await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'jobs:write',
      });
      const previousJob = await findJob(connection, { projectId, id: jobId, lock: true });
      const previousRun = await findRun(connection, { projectId, id: previousJob.runId });
      assertControlsJob({ role, userId: principal.user.id }, previousRun);
      if (await findOriginStepExecutionOfRun(connection, { projectId, runId: previousRun.id }))
        throw new DomainError({
          status: 409,
          code: 'workflow_retry_required',
          message: 'resume it from the workflow execution page',
        });
      const existingRetry = await first<Job>(
        connection,
        `SELECT ${jobColumns()} FROM jobs WHERE retry_of_job_id=$1`,
        [previousJob.id],
      );
      if (existingRetry) {
        const retryRun = await findRun(connection, { projectId, id: existingRetry.runId });
        await this.assertSameRetryCheckpoint(connection, {
          projectId,
          previousRun,
          retryRun,
          request: retryRequest,
        });
        return { job: existingRetry, run: retryRun };
      }
      assertRetryable(previousJob);
      const checkpointId = await selectRetryCheckpoint(connection, {
        projectId,
        previousRun,
        request: retryRequest,
      });
      return this.insertRetry(connection, {
        previousJob,
        previousRun,
        createdBy: principal.user.id,
        checkpointId,
      });
    });
  }

  /**
   * 終わったJobの次の試行を、新しいRunとJobとして作り、retry_of_job_idでつなぐ。再試行のAPIと
   * 自動の再試行で共有する。権限、重複の確認、checkpointの選択、自動の再試行ならmaxAttemptsの
   * 確認は呼び出し元が行う。それでも2回目の再試行は、一意のretry_of_job_idが拒む。
   */
  async insertRetry(
    connection: Connection,
    retry: { previousJob: Job; previousRun: Run; createdBy: string; checkpointId: string | null },
  ): Promise<{ run: Run; job: Job }> {
    const { previousJob, previousRun, checkpointId } = retry;
    assertRetryable(previousJob);
    const projectId = previousRun.projectId;
    const insertedRun = await this.runs.insertRun(connection, {
      projectId,
      createdBy: retry.createdBy,
      ...(previousRun.taskId && previousRun.taskRevision
        ? { task: { id: previousRun.taskId, revision: previousRun.taskRevision } }
        : {}),
      input: {
        experimentId: previousRun.experimentId,
        name: `${previousRun.name} (retry ${previousJob.attempt + 1})`,
        kind: previousRun.kind,
        parameters: previousRun.parameters,
        tags: previousRun.tags,
        modelVersionId: previousRun.modelVersionId,
        codeVersionId: previousRun.codeVersionId,
        executionMode: previousRun.executionMode ?? 'run',
        inputDatasetVersionIds: previousRun.inputDatasetVersionIds,
        parentRunId: await retryParentRunId(connection, previousRun),
        environment: previousRun.environment,
      },
      // 再試行した連鎖の評価でも、参照用のセットを上流の出力と分けて持つ。昇格とベースラインとの
      // 比較が、引き続きルールの入力と照らし合わせられるようにするため。
      upstreamDatasetVersionIds: previousRun.upstreamDatasetVersionIds,
    });
    const run = checkpointId
      ? await pinResumeCheckpoint(connection, { run: insertedRun, checkpointId })
      : insertedRun;
    const previous = (await first<{ hookChain: string[]; executor: ComputeTarget['executor'] }>(
      connection,
      'SELECT j.hook_chain,t.executor FROM jobs j JOIN compute_targets t ON t.id=j.target_id WHERE j.id=$1',
      [previousJob.id],
    ))!;
    const isSiteJob = previous.executor === 'site';
    const job = await this.insertJob(connection, {
      run,
      input: {
        runId: run.id,
        targetId: previousJob.targetId,
        // siteのJobのgpuIdsは、Jobが求めたものではなくrunnerに割り当てられたもの。
        gpuIds: isSiteJob ? [] : previousJob.gpuIds,
        maxAttempts: previousJob.maxAttempts,
        ...(isSiteJob
          ? {
              gpuCount: previousJob.gpuCount,
              retryOnFailure: previousJob.retryOnFailure,
              retryOnTimeout: previousJob.retryOnTimeout,
            }
          : {}),
        walltimeSeconds: previousJob.walltimeSeconds,
        allowChildJobs: previousJob.allowChildJobs,
      },
      attempt: previousJob.attempt + 1,
      // 再試行はarrayのindex、フック、ドライバーを保ち、グループと連鎖から見えるままにする。
      placement: {
        ...(previousJob.arrayGroupId !== null && previousJob.arrayIndex !== null
          ? { arrayGroupId: previousJob.arrayGroupId, arrayIndex: previousJob.arrayIndex }
          : {}),
        hookId: previousJob.hookId,
        hookChain: previous.hookChain,
        parentJobId: previousJob.parentJobId,
        chainDepth: previousJob.chainDepth,
        datasetPartitionVersionId: previousJob.datasetPartitionVersionId,
      },
    });
    await connection.query('UPDATE jobs SET retry_of_job_id=$2 WHERE id=$1', [
      job.id,
      previousJob.id,
    ]);
    return { run, job };
  }

  // 同じ再試行を送り直すと、作ったRunを返す。別のcheckpointを求めるものは拒む。
  private async assertSameRetryCheckpoint(
    connection: Connection,
    retry: { projectId: string; previousRun: Run; retryRun: Run; request: JobRetryInput },
  ): Promise<void> {
    const { request } = retry;
    if (!request.checkpointId && !request.resumeFromLatestCheckpoint) return;
    const requested = await selectRetryCheckpoint(connection, retry);
    if ((retry.retryRun.resumeCheckpointId ?? null) !== requested)
      throw new DomainError({
        status: 409,
        code: 'job_already_retried',
        message: 'this job has already been retried with different conditions',
      });
  }

  async getWorkerJob(connection: Connection, job: Job): Promise<WorkerJob> {
    const run = await findRun(connection, { projectId: job.projectId, id: job.runId });
    const target = await first<ComputeTarget>(
      connection,
      'SELECT * FROM compute_targets WHERE id=$1',
      [job.targetId],
    );
    if (!target || !run.codeVersionId)
      throw new DomainError({
        status: 503,
        code: 'invalid_job',
        message: 'cannot verify the execution settings of the job',
      });
    const codeVersion = await findCodeVersion(connection, {
      projectId: job.projectId,
      id: run.codeVersionId,
    });
    const modelVersion = run.modelVersionId
      ? await findModelVersion(connection, { projectId: job.projectId, id: run.modelVersionId })
      : null;
    validateCodeCompatibility(codeVersion, {
      model: modelVersion,
      kind: run.kind,
    });
    validatePinnedRuntime(codeVersion.runtime, run.environment.runtime);
    validateExecutionSnapshot(codeVersion, run);
    validateTargetCompatibility(target, {
      runtime: codeVersion.runtime,
      gpuIds: job.gpuIds,
      allowLocalExecutor: this.config.allowLocalExecutor,
    });
    await validateCodeArtifacts(connection, codeVersion);
    const inputDatasets = await findDatasetVersions(connection, {
      projectId: job.projectId,
      ids: run.inputDatasetVersionIds,
    });
    const resumeCheckpoint = await findWorkerResumeCheckpoint(connection, run);
    const inputCheckpoint = await findWorkerInputCheckpoint(connection, run);
    const triggerPayload = await findTriggerPayload(connection, job);
    const jobToken = await this.jobTokens.issueForWorker(connection, job);
    return {
      job,
      run,
      target,
      codeVersion,
      modelVersion,
      inputDatasets,
      jobToken,
      resumeCheckpoint,
      inputCheckpoint,
      triggerPayload,
    };
  }

  async reserveJob(
    connection: Connection,
    reservation: { job: Job; tokenId: string; workerId: string },
  ): Promise<Job> {
    const leaseId = randomUUID();
    const { job } = reservation;
    const previousRun = await findRun(connection, {
      projectId: job.projectId,
      id: job.runId,
      lock: true,
    });
    const claimed = (await first<Job>(
      connection,
      `UPDATE jobs SET status='claimed',worker_id=$2,lease_id=$3,worker_token_id=$4,started_at=now(),heartbeat_at=now()
      WHERE id=$1 RETURNING ${jobColumns()}`,
      [job.id, reservation.workerId, leaseId, reservation.tokenId],
    ))!;
    if (job.gpuIds.length)
      await connection.query(
        'INSERT INTO gpu_reservations(target_id,gpu_id,job_id) SELECT $1,unnest($2::text[]),$3',
        [job.targetId, job.gpuIds, job.id],
      );
    const run = (await first<Run>(
      connection,
      `UPDATE runs SET status='running',started_at=COALESCE(started_at,now()) WHERE id=$1 RETURNING ${runColumns}`,
      [job.runId],
    ))!;
    await this.runCompletion.recordStatusChange(connection, {
      previousStatus: previousRun.status,
      run,
    });
    return claimed;
  }
}
