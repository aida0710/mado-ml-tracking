import type {
  ComputeTarget,
  Job,
  JobPhase,
  ManualSiteConfiguration,
  ManualSubmissionWaiting,
  SiteSchedulerCancellation,
  SiteSubmission,
  SiteSubmissionAccount,
  SiteSubmissionMode,
  SiteSubmissionRequester,
  WorkerCapability,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { SiteSubmissionResultInput } from '../domain/siteExecutionValidation.js';
import { requiredWorkerCapabilitiesSql } from '../domain/workerCapabilities.js';
import { jobColumns } from '../repositories/jobRepository.js';
import { findCurrentJobShell } from '../repositories/siteJobShellRepository.js';
import { findSiteSettings } from '../repositories/siteSettingsRepository.js';
import { requireScope } from './accessService.js';
import type { JobService } from './jobService.js';
import { requireLauncher } from './launcherService.js';
import type { RunCompletionService } from './runCompletionService.js';
import {
  canRunQueuedJob,
  findSiteTarget,
  requireTargetUser,
  targetNotAvailable,
} from './siteAccess.js';
import { failUnstartedJob, submissionCountSql } from './siteJobEnding.js';
import { resolveSubmissionAccount } from './siteReadiness.js';

// claimした投入を持つ者。launcherか、自分のAPI tokenを使う依頼者。報告は同じ持ち主から
// 来なければならない。IDが同じで、tokenは同じ所有者のものならどれでもよい（tokenを差し替えた
// launcherも、自分が投入したものを報告できる）。
interface SubmissionHolder {
  tokenId: string;
  holderId: string;
}

interface ClaimScope {
  holder: SubmissionHolder;
  mode: SiteSubmissionMode;
  // 人のtokenは1つのProjectに限られていることがある。launcherのtokenはすべてのProjectに及ぶ。
  projectId: string | null;
  targetIds: string[] | null;
  // launcherは割り当てられたsiteだけをclaimする。
  launcherId: string | null;
  // 手動の投入は、依頼者がeditorであるProjectの、依頼者自身のRunを取る。コンピュータの
  // 所有者がすべてを取る場合は除く。
  requesterId: string | null;
  // 手動の投入でjob shellを実行する人。その人の設定が使われる。
  submittingUserId: string | null;
  // 持ち主が入れるrunnerがJobのコードに渡すもの（claimが挙げたとおり）。それ以上を要するJobは、
  // workerと同じく（WorkerService.claim）、それを持つrunnerの持ち主を待つ。
  capabilities: WorkerCapability[];
  limit: number;
}

// 持ち主の所有者のtokenを求めるSQL。$tokenはリクエストのtoken。
const HOLDER_TOKENS_SQL = (token: string) =>
  `(SELECT o.id FROM api_tokens o WHERE o.user_id=(SELECT t.user_id FROM api_tokens t WHERE t.id=${token}))`;

// Job `j`が、launcher $launcherが今投入を受け持つ自動のsiteにあることを表すSQL。
const ASSIGNED_SITE_SQL = (launcher: string) =>
  `EXISTS(SELECT 1 FROM compute_targets t JOIN site_settings s ON s.target_id=t.id
    WHERE t.id=j.target_id AND t.submission_mode='automatic' AND s.launcher_id=${launcher})`;

const SUBMISSION_SAVEPOINT = 'site_submission';
// launcherの1回のリクエストに返す取り消しの数。残りはlauncherがもう一度尋ねる。
const CANCELLATION_LIST_LIMIT = 1000;
const TERMINAL_STATUSES = ['finished', 'failed', 'canceled'];

function invalidSubmission(message: string): never {
  throw new DomainError({ status: 409, code: 'invalid_submission', message });
}

// 手動の投入は依頼者自身がsiteで行うことなので、本人のAPI tokenが要る。ブラウザのsessionでは
// `mado-tracking submit`を実行できず、Job tokenは本人のものではなくJobのもの。
function requireSubmitterToken(principal: Principal, scope: string): { tokenId: string } {
  if (principal.method !== 'token' || !principal.token || principal.token.job)
    throw new DomainError({
      status: 403,
      code: 'api_token_required',
      message: 'a personal API token is required',
    });
  requireScope(principal, scope);
  return { tokenId: principal.token.id };
}

/**
 * siteのJobを、それを投入する者に渡す（docs/sites.md）。claimは順番待ちのJobを
 * claimed/submittingへ移し、Job tokenを発行する。報告はsiteのjob shellが行ったことを記録する。
 * runnerがコンテナを始めるまで、Runは順番待ちのまま。
 */
export class SiteSubmissionService {
  private readonly database: Database;
  private readonly jobs: JobService;
  private readonly runCompletion: RunCompletionService;
  constructor(options: { database: Database; jobs: JobService; runCompletion: RunCompletionService }) {
    this.database = options.database;
    this.jobs = options.jobs;
    this.runCompletion = options.runCompletion;
  }

  async claim(
    principal: Principal,
    request: { targetIds?: string[]; limit: number; capabilities: WorkerCapability[] },
  ): Promise<SiteSubmission[]> {
    return transaction(this.database, async (connection) => {
      const launcher = await requireLauncher(connection, principal);
      const holder = { tokenId: launcher.tokenId, holderId: launcher.launcherId };
      await this.lockHolder(connection, holder);
      await connection.query('UPDATE launchers SET last_seen_at=now() WHERE id=$1', [launcher.launcherId]);
      return this.claimSubmissions(connection, {
        holder,
        mode: 'automatic',
        projectId: null,
        targetIds: request.targetIds ?? null,
        launcherId: launcher.launcherId,
        requesterId: null,
        submittingUserId: null,
        capabilities: request.capabilities,
        limit: request.limit,
      });
    });
  }

  async report(
    principal: Principal,
    request: { results: SiteSubmissionResultInput[] },
  ): Promise<Job[]> {
    return transaction(this.database, async (connection) => {
      const launcher = await requireLauncher(connection, principal);
      return this.applyResults(connection, {
        holder: { tokenId: launcher.tokenId, holderId: launcher.launcherId },
        results: request.results,
      });
    });
  }

  /**
   * このlauncherが今投入を受け持つsiteで、スケジューラのキューに入ったまま終わったJob。どの
   * launcherがキューに入れたかは問わない。siteが別のlauncherに移ったら、新しいlauncherが自分の
   * 鍵でログインして取り除く。
   */
  async cancellations(
    principal: Principal,
    request: { targetIds?: string[] },
  ): Promise<SiteSchedulerCancellation[]> {
    return transaction(this.database, async (connection) => {
      const launcher = await requireLauncher(connection, principal);
      const pending = await rows<{ jobId: string; targetId: string; schedulerJobId: string; requesterId: string }>(
        connection,
        `SELECT j.id AS job_id,j.target_id,j.scheduler_job_id,r.created_by AS requester_id
        FROM jobs j JOIN runs r ON r.id=j.run_id AND r.project_id=j.project_id
        WHERE ${ASSIGNED_SITE_SQL('$1')}
        AND j.scheduler_cancel_state='pending' AND ($2::uuid[] IS NULL OR j.target_id=ANY($2::uuid[]))
        ORDER BY j.ended_at,j.id LIMIT $3`,
        [launcher.launcherId, request.targetIds ?? null, CANCELLATION_LIST_LIMIT],
      );
      const cancellations: SiteSchedulerCancellation[] = [];
      for (const { requesterId, ...job } of pending)
        cancellations.push({
          ...job,
          account: await this.cancellationAccount(connection, { targetId: job.targetId, requesterId }),
        });
      return cancellations;
    });
  }

  async reportCancellations(
    principal: Principal,
    request: { jobIds: string[] },
  ): Promise<void> {
    await transaction(this.database, async (connection) => {
      const launcher = await requireLauncher(connection, principal);
      await connection.query(
        `UPDATE jobs j SET scheduler_cancel_state='done'
        WHERE j.id=ANY($1::uuid[]) AND ${ASSIGNED_SITE_SQL('$2')} AND j.scheduler_cancel_state='pending'`,
        [request.jobIds, launcher.launcherId],
      );
    });
  }

  /**
   * `mado-tracking submit`を待つJobのある手動のsite。自分のJobと、自分が持つコンピュータで
   * 待っているすべてのJob（`--all`が取るもの）。
   */
  async listManual(principal: Principal): Promise<ManualSubmissionWaiting[]> {
    requireSubmitterToken(principal, 'read');
    return rows<ManualSubmissionWaiting>(
      this.database,
      `SELECT t.id AS target_id,t.name AS target_name,
        (count(*) FILTER (WHERE r.created_by=$1 AND EXISTS(SELECT 1 FROM effective_project_roles e
          WHERE e.project_id=j.project_id AND e.user_id=$1 AND e.role IN ('editor','admin'))))::int AS waiting_jobs,
        CASE WHEN t.owner_user_id=$1 THEN count(*)::int END AS all_waiting_jobs
      FROM jobs j JOIN compute_targets t ON t.id=j.target_id
      JOIN runs r ON r.id=j.run_id AND r.project_id=j.project_id
      WHERE j.status='queued' AND j.phase='waiting_manual' AND (r.created_by=$1 OR t.owner_user_id=$1)
      AND ($2::uuid IS NULL OR j.project_id=$2)
      GROUP BY t.id,t.name,t.owner_user_id
      HAVING t.owner_user_id=$1 OR count(*) FILTER (WHERE r.created_by=$1 AND EXISTS(
        SELECT 1 FROM effective_project_roles e
        WHERE e.project_id=j.project_id AND e.user_id=$1 AND e.role IN ('editor','admin'))) > 0
      ORDER BY t.name`,
      [principal.user.id, principal.token?.projectId ?? null],
    );
  }

  /** `mado-tracking submit`がclaimする前に要るもの。設定、job shell、自分のアカウント。 */
  async manualConfiguration(principal: Principal, targetId: string): Promise<ManualSiteConfiguration> {
    requireSubmitterToken(principal, 'read');
    return transaction(this.database, async (connection) => {
      const target = await this.manualTarget(connection, targetId);
      await requireTargetUser(connection, principal, target);
      const settings = (await findSiteSettings(connection, targetId))!;
      return {
        target,
        settings,
        jobShell: (await findCurrentJobShell(connection, targetId)) ?? null,
        account: await resolveSubmissionAccount(connection, {
          target,
          settings,
          requesterId: principal.user.id,
          submittingUserId: principal.user.id,
        }),
      };
    });
  }

  async claimManual(
    principal: Principal,
    request: {
      targetId: string;
      submitterId: string;
      limit: number;
      all: boolean;
      capabilities: WorkerCapability[];
    },
  ): Promise<SiteSubmission[]> {
    const { tokenId } = requireSubmitterToken(principal, 'jobs:write');
    return transaction(this.database, async (connection) => {
      const target = await this.manualTarget(connection, request.targetId);
      if (request.all && target.ownerUserId !== principal.user.id)
        throw new DomainError({
          status: 403,
          code: 'site_owner_required',
          message: 'only the owner of this computer can submit jobs of everyone',
        });
      const holder = { tokenId, holderId: request.submitterId };
      await this.lockHolder(connection, holder);
      return this.claimSubmissions(connection, {
        holder,
        mode: 'manual',
        projectId: principal.token?.projectId ?? null,
        targetIds: [request.targetId],
        launcherId: null,
        requesterId: request.all ? null : principal.user.id,
        submittingUserId: principal.user.id,
        capabilities: request.capabilities,
        limit: request.limit,
      });
    });
  }

  async reportManual(
    principal: Principal,
    request: { submitterId: string; results: SiteSubmissionResultInput[] },
  ): Promise<Job[]> {
    const { tokenId } = requireSubmitterToken(principal, 'jobs:write');
    return transaction(this.database, async (connection) =>
      this.applyResults(connection, {
        holder: { tokenId, holderId: request.submitterId },
        results: request.results,
      }),
    );
  }

  private async manualTarget(connection: Connection, targetId: string): Promise<ComputeTarget> {
    const target = await findSiteTarget(connection, targetId);
    if (target.submissionMode !== 'manual')
      throw new DomainError({
        status: 422,
        code: 'site_not_manual',
        message: 'a launcher submits jobs for this site (it is not a manual site)',
      });
    return target;
  }

  // Jobをキューに入れたアカウント。取り消しのコマンドはこのアカウントで動く。その後に本人の
  // 設定が変わっていることがあるので、できる範囲で求める（その場合、launcherはJobをキューに残す）。
  private async cancellationAccount(
    connection: Connection,
    job: { targetId: string; requesterId: string },
  ): Promise<SiteSubmissionAccount> {
    const target = await findSiteTarget(connection, job.targetId);
    const settings = (await findSiteSettings(connection, job.targetId))!;
    try {
      return await resolveSubmissionAccount(connection, {
        target,
        settings,
        requesterId: job.requesterId,
        submittingUserId: null,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return {
        mode: settings.accountMode,
        accountName: '',
        workDirectory: settings.workDirectory,
        variables: settings.variables,
        keyId: null,
      };
    }
  }

  // 同じ持ち主からの重複したHTTPのリクエストを1つずつ進める。ほかの持ち主はSKIP LOCKEDを使える。
  private async lockHolder(connection: Connection, holder: SubmissionHolder): Promise<void> {
    await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `site:${holder.tokenId}:${holder.holderId}`,
    ]);
  }

  private async claimSubmissions(
    connection: Connection,
    scope: ClaimScope,
  ): Promise<SiteSubmission[]> {
    const waitingPhase: JobPhase | null = scope.mode === 'manual' ? 'waiting_manual' : null;
    const submissions: SiteSubmission[] = [];
    const seen: string[] = [];
    // 上限に達したコンピュータと、別のclaimが今まさに埋めているコンピュータ。
    const unavailableTargets: string[] = [];
    while (submissions.length < scope.limit) {
      // arrayの最初の要素が残りを代表する。capabilityを要する唯一の種類のJobである
      // ワークフローのstepは、arrayにならない（Taskは1つのJobを始める）。
      const candidate = await first<Job>(
        connection,
        `SELECT ${jobColumns('j')} FROM jobs j JOIN compute_targets t ON t.id=j.target_id
        JOIN runs r ON r.id=j.run_id AND r.project_id=j.project_id
        WHERE j.status='queued' AND j.phase IS NOT DISTINCT FROM $1::text
        AND t.executor='site' AND t.submission_mode=$2 AND t.enabled
        AND ($3::uuid IS NULL OR j.project_id=$3) AND ($4::uuid[] IS NULL OR j.target_id=ANY($4::uuid[]))
        AND ($5::uuid IS NULL OR (r.created_by=$5 AND EXISTS(SELECT 1 FROM effective_project_roles e
          WHERE e.project_id=j.project_id AND e.user_id=$5 AND e.role IN ('editor','admin'))))
        AND NOT(j.id=ANY($6::uuid[])) AND NOT(j.target_id=ANY($7::uuid[]))
        AND ($8::uuid IS NULL OR EXISTS(SELECT 1 FROM site_settings s
          WHERE s.target_id=j.target_id AND s.launcher_id=$8))
        AND ${requiredWorkerCapabilitiesSql('r')} <@ $9::text[]
        ORDER BY j.created_at,j.array_index NULLS FIRST,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
        [
          waitingPhase,
          scope.mode,
          scope.projectId,
          scope.targetIds,
          scope.requesterId,
          seen,
          unavailableTargets,
          scope.launcherId,
          scope.capabilities,
        ],
      );
      if (!candidate) break;
      const target = await this.reserveTargetCapacity(connection, candidate.targetId);
      if (!target) {
        unavailableTargets.push(candidate.targetId);
        continue;
      }
      const members =
        target.supportsArray && candidate.arrayGroupId
          ? await rows<Job>(
              connection,
              `SELECT ${jobColumns()} FROM jobs WHERE array_group_id=$1 AND target_id=$2 AND status='queued'
              AND phase IS NOT DISTINCT FROM $3::text ORDER BY array_index,id FOR UPDATE SKIP LOCKED`,
              [candidate.arrayGroupId, target.id, waitingPhase],
            )
          : [candidate];
      seen.push(...members.map((job) => job.id));
      const submission = await this.submit(connection, {
        target,
        members,
        holder: scope.holder,
        submittingUserId: scope.submittingUserId,
      });
      if (submission) submissions.push(submission);
    }
    return submissions;
  }

  /**
   * Jobをclaimする間siteをロックし、上限を確かめる。siteではmaxConcurrentJobsは投入の数を数える
   * （siteがarrayを扱えるならarrayは1つ）。Jobを配置するのは、trackingではなくスケジューラで
   * あるため。
   */
  private async reserveTargetCapacity(
    connection: Connection,
    targetId: string,
  ): Promise<ComputeTarget | undefined> {
    const target = await first<ComputeTarget>(
      connection,
      'SELECT * FROM compute_targets WHERE id=$1 AND enabled=true FOR UPDATE SKIP LOCKED',
      [targetId],
    );
    if (!target) return undefined;
    const occupancy = (await first<{ count: number }>(
      connection,
      `SELECT ${submissionCountSql('$2')} AS count FROM jobs
      WHERE target_id=$1 AND status IN ('claimed','running')`,
      [target.id, target.supportsArray],
    ))!;
    return occupancy.count < target.maxConcurrentJobs ? target : undefined;
  }

  // siteに伝えられないJob（削除されたcheckpoint、siteにアカウントの無い依頼者、非公開のsiteを
  // もう使えない依頼者など）は、claimのたびにキューを詰まらせないよう失敗にする。
  private async submit(
    connection: Connection,
    submission: {
      target: ComputeTarget;
      members: Job[];
      holder: SubmissionHolder;
      submittingUserId: string | null;
    },
  ): Promise<SiteSubmission | null> {
    const { target, members, holder } = submission;
    await connection.query(`SAVEPOINT ${SUBMISSION_SAVEPOINT}`);
    try {
      // arrayの要素の依頼者はすべて同じ。
      if (!(await canRunQueuedJob(connection, members[0]!))) targetNotAvailable(422);
      const settings = await findSiteSettings(connection, target.id);
      const jobShell = settings ? await findCurrentJobShell(connection, target.id) : undefined;
      if (!settings || !jobShell)
        throw new DomainError({
          status: 422,
          code: 'site_submission_unready',
          message: 'this computer has no job shell',
        });
      const requester = (await first<SiteSubmissionRequester>(
        connection,
        'SELECT u.id,u.email,u.username FROM runs r JOIN users u ON u.id=r.created_by WHERE r.id=$1',
        [members[0]!.runId],
      ))!;
      const account = await resolveSubmissionAccount(connection, {
        target,
        settings,
        requesterId: requester.id,
        submittingUserId: submission.submittingUserId,
      });
      const claimed = await rows<Job>(
        connection,
        `UPDATE jobs SET status='claimed',phase='submitting',worker_id=$2,lease_id=gen_random_uuid(),
          worker_token_id=$3,heartbeat_at=now(),site_job_shell_id=$4
        WHERE id=ANY($1::uuid[]) RETURNING ${jobColumns()}`,
        [members.map((job) => job.id), holder.holderId, holder.tokenId, jobShell.id],
      );
      claimed.sort((left, right) => (left.arrayIndex ?? 0) - (right.arrayIndex ?? 0));
      const workerJobs = [];
      for (const job of claimed) workerJobs.push(await this.jobs.getWorkerJob(connection, job));
      await connection.query(`RELEASE SAVEPOINT ${SUBMISSION_SAVEPOINT}`);
      return {
        target,
        arrayGroupId: claimed[0]!.arrayGroupId,
        requester,
        jobs: workerJobs,
        settings,
        jobShell,
        account,
      };
    } catch (error) {
      await connection.query(`ROLLBACK TO SAVEPOINT ${SUBMISSION_SAVEPOINT}`);
      if (!(error instanceof DomainError)) throw error;
      for (const job of members)
        await failUnstartedJob(connection, this.runCompletion, {
          job,
          endReason: 'submit_failed',
          error: error.message,
        });
      return null;
    }
  }

  private async applyResults(
    connection: Connection,
    report: { holder: SubmissionHolder; results: SiteSubmissionResultInput[] },
  ): Promise<Job[]> {
    const { holder } = report;
    const reported: Job[] = [];
    for (const result of report.results) {
      const jobs = await rows<Job>(
        connection,
        `SELECT ${jobColumns()} FROM jobs WHERE id=ANY($1::uuid[])
        AND worker_token_id IN ${HOLDER_TOKENS_SQL('$2')} AND worker_id=$3
        ORDER BY array_index NULLS FIRST,id FOR UPDATE`,
        [result.jobIds, holder.tokenId, holder.holderId],
      );
      if (jobs.length !== result.jobIds.length)
        invalidSubmission('this job was not received by this launcher (submit)');
      for (const job of jobs)
        reported.push(
          result.outcome === 'submitted'
            ? await this.recordSubmitted(connection, { job, schedulerJobId: result.schedulerJobId ?? null })
            : await this.recordFailed(connection, { job, error: result.error ?? null }),
        );
    }
    return reported;
  }

  private async recordSubmitted(
    connection: Connection,
    submitted: { job: Job; schedulerJobId: string | null },
  ): Promise<Job> {
    const { job, schedulerJobId } = submitted;
    if (job.status === 'claimed' && job.phase === 'submitting')
      return (await first<Job>(
        connection,
        `UPDATE jobs SET phase='submitted',scheduler_job_id=$2,submitted_at=now(),heartbeat_at=now()
        WHERE id=$1 RETURNING ${jobColumns()}`,
        [job.id, schedulerJobId],
      ))!;
    // 再送、job shellが戻る前にrunnerが報告した直接実行するホスト、または先に終わったJob。
    // このときはスケジューラのIDだけを埋める。runnerが始まる前に終わったJobは、まだキューに
    // スケジューラのジョブが残っているので、launcherがそれを取り除く。
    return (await first<Job>(
      connection,
      `UPDATE jobs SET scheduler_job_id=COALESCE(scheduler_job_id,$2),submitted_at=COALESCE(submitted_at,now()),
        scheduler_cancel_state=CASE
          WHEN status=ANY($3::text[]) AND runner_instance_id IS NULL AND scheduler_cancel_state IS NULL
            AND COALESCE(scheduler_job_id,$2) IS NOT NULL THEN 'pending'
          ELSE scheduler_cancel_state END
      WHERE id=$1 RETURNING ${jobColumns()}`,
      [job.id, schedulerJobId, TERMINAL_STATUSES],
    ))!;
  }

  private async recordFailed(
    connection: Connection,
    failed: { job: Job; error: string | null },
  ): Promise<Job> {
    const { job } = failed;
    if (job.status === 'claimed' && job.phase === 'submitting')
      return failUnstartedJob(connection, this.runCompletion, {
        job,
        endReason: 'submit_failed',
        error: failed.error ?? 'siteのjob shellが投入に失敗しました',
      });
    if (job.status === 'claimed' && job.phase === 'submitted')
      invalidSubmission('a job reported as submitted cannot be failed');
    // 再送か、既に終わったJob、またはrunnerが自分で報告するJob。
    return job;
  }
}
