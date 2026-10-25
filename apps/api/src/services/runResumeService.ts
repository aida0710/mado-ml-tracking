import type { RunResumeEventPage, RunResumeResult } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { notFound } from '../domain/errors.js';
import { buildRunSegments, decideRunResume, storedResumeReason } from '../domain/runResume.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import {
  findLastMetricSteps,
  insertRunResumeEvent,
  listRunResumeEvents,
  lockRunForResume,
  markRunResumed,
} from '../repositories/runResumeRepository.js';
import { rejectJobToken, requireProject } from './accessService.js';
import { auditActor, NO_REQUEST_METADATA, recordDenial } from './auditService.js';
import type { RunCompletionService } from './runCompletionService.js';

/**
 * Jobの無い終わったRunを開き直し、SDKが続きを書き足せるようにする（wandbのresume、MLflowの
 * start_run(run_id=)）。開き直すたびに、追記だけのresumeのイベントとして残す。
 */
export class RunResumeService {
  constructor(
    private readonly database: Database,
    private readonly runCompletion: RunCompletionService,
  ) {}

  async resume(
    principal: Principal,
    target: { projectId: string; runId: string; reason?: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<RunResumeResult> {
    const { projectId, runId } = target;
    const reason = storedResumeReason(target.reason);
    const draft = {
      ...auditActor(principal),
      ...request,
      action: 'run.resume',
      resourceType: 'run',
      resourceId: runId,
      projectId,
      details: {},
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        // Jobのコードは自分のRunに書けるが、開き直すことはできない。Jobが持つRunは確定している。
        rejectJobToken(principal);
        await requireProject(connection, principal, {
          projectId,
          role: 'editor',
          scope: 'runs:write',
        });
        const locked = await lockRunForResume(connection, { projectId, runId });
        if (!locked) notFound('run');
        const lastSteps = await findLastMetricSteps(connection, runId);
        const decision = decideRunResume(locked, { hasJob: locked.hasJob });
        if (!decision.resume)
          return {
            run: await findRun(connection, { projectId, id: runId }),
            resumed: false,
            event: null,
            lastSteps,
          };
        const event = await insertRunResumeEvent(connection, {
          projectId,
          runId,
          previousStatus: decision.previousStatus,
          previousEndedAt: locked.endedAt,
          source: 'native',
          actorUserId: principal.user.id,
          actorTokenId: principal.token?.id ?? null,
          reason,
        });
        const run = await markRunResumed(connection, runId);
        await this.runCompletion.recordStatusChange(connection, {
          previousStatus: decision.previousStatus,
          run,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            eventId: event.id,
            previousStatus: decision.previousStatus,
            hasReason: reason !== null,
          },
        });
        return { run, resumed: true, event, lastSteps };
      }),
    );
  }

  async listEvents(
    principal: Principal,
    target: { projectId: string; runId: string },
  ): Promise<RunResumeEventPage> {
    return transaction(this.database, async (connection) => {
      // 区間を作るには、イベントとRunの今の終了を同じスナップショットから読まなければならない。
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await requireProject(connection, principal, {
        projectId: target.projectId,
        role: 'viewer',
        scope: 'read',
      });
      const run = await findRun(connection, { projectId: target.projectId, id: target.runId });
      const items = await listRunResumeEvents(connection, target);
      const segments =
        run.startedAt === null ? [] : buildRunSegments({ ...run, startedAt: run.startedAt }, items);
      return { items, segments };
    });
  }
}
