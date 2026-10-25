import {
  MAX_ACTIVE_CHILD_JOBS,
  MAX_CHILD_JOBS_PER_PARENT,
  MAX_JOB_CHAIN_DEPTH,
  type ChildJobCreated,
  type ChildJobWait,
  type Job,
  type JobStatusCounts,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { ChildJobCreateInput } from '../domain/hookValidation.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import { findJob, jobColumns } from '../repositories/jobRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import type { JobArrayService } from './jobArrayService.js';
import type { JobService } from './jobService.js';
import type { RunService } from './runService.js';

interface JobReference {
  projectId: string;
  jobId: string;
}

// 待っているドライバーはおよそ1秒に1回DBに問い合わせる。子のJobは数分から数時間かかる。
const WAIT_POLL_INTERVAL_MS = 1000;
const ACTIVE_STATUSES = ['queued', 'claimed', 'running'];

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * ドライバー（docs/hooks.md）。Jobの中のコードが、パイプラインの定義の代わりに、Job tokenで別の
 * Jobを作り、その終わりを待って結果を読む。子のJobは親Runの作成者として動き、親Runの下に
 * ぶら下がり、親が取り消されると終わる。
 */
export class ChildJobService {
  private readonly database: Database;
  private readonly runs: RunService;
  private readonly jobs: JobService;
  private readonly jobArrays: JobArrayService;
  constructor(options: {
    database: Database;
    runs: RunService;
    jobs: JobService;
    jobArrays: JobArrayService;
  }) {
    this.database = options.database;
    this.runs = options.runs;
    this.jobs = options.jobs;
    this.jobArrays = options.jobArrays;
  }

  async create(
    principal: Principal,
    reference: JobReference,
    input: ChildJobCreateInput,
  ): Promise<ChildJobCreated> {
    const binding = principal.token?.job;
    if (
      !binding ||
      !sameId(binding.jobId, reference.jobId) ||
      !principal.token?.projectId ||
      !sameId(principal.token.projectId, reference.projectId)
    )
      throw new DomainError({
        status: 403,
        code: 'driver_token_required',
        message: 'create child jobs with the Job token of the parent job',
      });
    assertNoReservedRunTags(input.tags);
    return transaction(this.database, async (connection) => {
      // Job tokenは親Runの作成者として動く。その作成者が今もeditorである必要がある。
      await requireProject(connection, principal, {
        projectId: reference.projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      // 親をロックして子の作成を1つずつ進める。上限とキーの確認が、互いの作成を見られるようにする。
      const parent = await findJob(connection, {
        projectId: reference.projectId,
        id: reference.jobId,
        lock: true,
      });
      if (!parent.allowChildJobs)
        throw new DomainError({
          status: 403,
          code: 'child_jobs_not_allowed',
          message: 'this job cannot create child jobs',
        });
      const existing = await this.findByKey(connection, {
        projectId: reference.projectId,
        parentJobId: parent.id,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) return existing;
      if (parent.chainDepth + 1 > MAX_JOB_CHAIN_DEPTH)
        throw new DomainError({
          status: 422,
          code: 'chain_too_deep',
          message: `jobs can be chained at most ${MAX_JOB_CHAIN_DEPTH} levels deep`,
          details: { limit: MAX_JOB_CHAIN_DEPTH },
        });
      await this.assertWithinLimits(connection, { parentJobId: parent.id, adding: input.arraySize ?? 1 });
      const parentRun = await findRun(connection, {
        projectId: reference.projectId,
        id: parent.runId,
      });
      const placement = await first<{ hookChain: string[] }>(
        connection,
        'SELECT hook_chain FROM jobs WHERE id=$1',
        [parent.id],
      );
      const chain = { hookChain: placement!.hookChain, chainDepth: parent.chainDepth + 1 };
      const experimentId = input.experimentId ?? parentRun.experimentId;
      if (input.arraySize !== null) {
        const created = await this.jobArrays.insertArray(connection, {
          projectId: reference.projectId,
          input: {
            experimentId,
            name: input.name,
            kind: input.kind,
            codeVersionId: input.codeVersionId,
            modelVersionId: input.modelVersionId,
            inputDatasetVersionIds: input.inputDatasetVersionIds,
            parameters: input.parameters,
            tags: input.tags,
            targetId: input.targetId,
            gpuCount: input.gpuCount,
            walltimeSeconds: input.walltimeSeconds,
            size: input.arraySize,
            maxAttempts: input.maxAttempts,
            retryOnFailure: input.retryOnFailure,
            retryOnTimeout: input.retryOnTimeout,
            allowChildJobs: input.allowChildJobs,
            datasetPartitionVersionId: input.datasetPartitionVersionId,
          },
          origin: {
            createdBy: parentRun.createdBy,
            parentRunId: parentRun.id,
            placement: { parentJobId: parent.id, ...chain },
            idempotencyKey: input.idempotencyKey,
          },
        });
        return { created: true, arrayGroupId: created.arrayGroup.id, jobs: created.jobs };
      }
      const run = await this.runs.insertRun(connection, {
        projectId: reference.projectId,
        createdBy: parentRun.createdBy,
        input: {
          experimentId,
          name: input.name,
          kind: input.kind,
          parameters: input.parameters,
          tags: input.tags,
          modelVersionId: input.modelVersionId,
          codeVersionId: input.codeVersionId,
          inputDatasetVersionIds: input.inputDatasetVersionIds,
          parentRunId: parentRun.id,
          environment: {},
        },
      });
      const job = await this.jobs.insertJob(connection, {
        run,
        input: {
          runId: run.id,
          targetId: input.targetId,
          gpuIds: input.gpuIds,
          gpuCount: input.gpuCount,
          walltimeSeconds: input.walltimeSeconds,
          maxAttempts: input.maxAttempts,
          retryOnFailure: input.retryOnFailure,
          retryOnTimeout: input.retryOnTimeout,
          allowChildJobs: input.allowChildJobs,
        },
        attempt: 1,
        placement: {
          parentJobId: parent.id,
          ...chain,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { created: true, arrayGroupId: null, jobs: [job] };
    });
  }

  async list(principal: Principal, reference: JobReference): Promise<Job[]> {
    await requireProject(this.database, principal, {
      projectId: reference.projectId,
      role: 'viewer',
      scope: 'read',
    });
    const parent = await findJob(this.database, {
      projectId: reference.projectId,
      id: reference.jobId,
    });
    return rows<Job>(
      this.database,
      `SELECT ${jobColumns()} FROM jobs WHERE parent_job_id=$1
      ORDER BY created_at,array_index NULLS FIRST,attempt,id`,
      [parent.id],
    );
  }

  /** 順番待ち・実行中の子が無くなるか、待つ時間が尽きたら返る。 */
  async wait(
    principal: Principal,
    reference: JobReference & { timeoutSeconds: number },
  ): Promise<ChildJobWait> {
    await requireProject(this.database, principal, {
      projectId: reference.projectId,
      role: 'viewer',
      scope: 'read',
    });
    const parent = await findJob(this.database, {
      projectId: reference.projectId,
      id: reference.jobId,
    });
    const deadline = Date.now() + reference.timeoutSeconds * 1000;
    for (;;) {
      const counts = await this.countChildren(this.database, parent.id);
      const active = counts.queued + counts.claimed + counts.running;
      if (active === 0) return { done: true, counts };
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { done: false, counts };
      await sleep(Math.min(WAIT_POLL_INTERVAL_MS, remaining));
    }
  }

  // キーは1回の作成を指す。1つのJobか、array（キーはそのグループが持つ）。
  private async findByKey(
    connection: Connection,
    key: { projectId: string; parentJobId: string; idempotencyKey: string },
  ): Promise<ChildJobCreated | null> {
    const job = await first<Job>(
      connection,
      `SELECT ${jobColumns()} FROM jobs WHERE parent_job_id=$1 AND idempotency_key=$2`,
      [key.parentJobId, key.idempotencyKey],
    );
    if (job) return { created: false, arrayGroupId: null, jobs: [job] };
    const group = await first<{ id: string }>(
      connection,
      'SELECT id FROM job_array_groups WHERE parent_job_id=$1 AND idempotency_key=$2',
      [key.parentJobId, key.idempotencyKey],
    );
    if (!group) return null;
    const described = await this.jobArrays.describe(connection, {
      projectId: key.projectId,
      groupId: group.id,
    });
    return { created: false, arrayGroupId: group.id, jobs: described.jobs };
  }

  private async assertWithinLimits(
    connection: Connection,
    request: { parentJobId: string; adding: number },
  ): Promise<void> {
    const counted = (await first<{ total: number; active: number }>(
      connection,
      `SELECT count(*)::int AS total,count(*) FILTER(WHERE status=ANY($2::text[]))::int AS active
      FROM jobs WHERE parent_job_id=$1`,
      [request.parentJobId, ACTIVE_STATUSES],
    ))!;
    if (
      counted.total + request.adding > MAX_CHILD_JOBS_PER_PARENT ||
      counted.active + request.adding > MAX_ACTIVE_CHILD_JOBS
    )
      throw new DomainError({
        status: 409,
        code: 'child_job_limit',
        message: `a parent can have at most ${MAX_CHILD_JOBS_PER_PARENT} child jobs, ${MAX_ACTIVE_CHILD_JOBS} of them at a time`,
        details: { limit: MAX_CHILD_JOBS_PER_PARENT, activeLimit: MAX_ACTIVE_CHILD_JOBS },
      });
  }

  // 各子の今の試行を数える。再試行された試行は、その再試行の側で数える。
  private async countChildren(connection: Connection, parentJobId: string): Promise<JobStatusCounts> {
    const grouped = await rows<{ status: keyof Omit<JobStatusCounts, 'total'>; count: number }>(
      connection,
      `SELECT j.status,count(*)::int AS count FROM jobs j WHERE j.parent_job_id=$1
      AND NOT EXISTS(SELECT 1 FROM jobs retry WHERE retry.retry_of_job_id=j.id)
      GROUP BY j.status`,
      [parentJobId],
    );
    const counts: JobStatusCounts = {
      queued: 0,
      claimed: 0,
      running: 0,
      finished: 0,
      failed: 0,
      canceled: 0,
      total: 0,
    };
    for (const { status, count } of grouped) {
      counts[status] = count;
      counts.total += count;
    }
    return counts;
  }
}
