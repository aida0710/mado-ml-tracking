import type {
  ArtifactPresence,
  Run,
  SyncBatchCounts,
  SyncBatchResult,
  SyncBatchStatus,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import {
  assertNotFutureTimestamp,
  type ArtifactPresenceCheckInput,
  type SyncBatchInput,
  type SyncRunCreateInput,
} from '../domain/runSyncValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import {
  claimSyncBatch,
  findChangedParamKeys,
  findPresentArtifactPaths,
  findSyncBatchCounts,
  findSyncRunOwnership,
  lockSyncRunId,
  markSyncRunEnded,
  markSyncRunStarted,
  mergeSyncRunRecords,
  recordSyncBatchStatus,
  type SyncRunOwnership,
} from '../repositories/runSyncRepository.js';
import { appendLogs, appendMetrics } from '../repositories/telemetryRepository.js';
import { rejectJobToken, requireProject } from './accessService.js';
import { auditActor, NO_REQUEST_METADATA, recordDenial } from './auditService.js';
import type { RunCompletionService } from './runCompletionService.js';
import type { RunService } from './runService.js';

export interface SyncRunResult {
  run: Run;
  created: boolean;
}

/**
 * 同期は、同じ利用者がJobなしで作ったRunにだけ書く。JobのRunはworkerがオンラインで報告する。
 * また、別の利用者の同じIDのRunは再送ではなく衝突。
 */
function assertSyncRunOwned(
  ownership: SyncRunOwnership,
  owner: { projectId: string; userId: string },
): void {
  if (
    ownership.projectId !== owner.projectId ||
    ownership.createdBy !== owner.userId ||
    ownership.hasJob ||
    ownership.lifecycleStage !== 'active'
  )
    throw new DomainError({
      status: 409,
      code: 'sync_run_conflict',
      message: 'this run ID is used by another run, so it cannot be synced',
    });
}

function countBatch(batch: SyncBatchInput): SyncBatchCounts {
  return {
    metrics: batch.metrics.length,
    params: Object.keys(batch.params).length,
    tags: Object.keys(batch.tags).length,
    logs: batch.logs.length,
  };
}

/**
 * APIに届かない場所で記録したRunを受け取る。RunのIDとすべてのbatchのIDはクライアントが選ぶ
 * ので、途中で失敗した送信を最初からやり直しても重複しない。
 */
export class RunSyncService {
  constructor(
    private readonly database: Database,
    private readonly dependencies: {
      runs: RunService;
      runCompletion: RunCompletionService;
    },
  ) {}

  async createRun(
    principal: Principal,
    target: { projectId: string; runId: string; input: SyncRunCreateInput },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<SyncRunResult> {
    const { projectId, runId, input } = target;
    assertNoReservedRunTags(input.tags);
    assertNotFutureTimestamp(input.startedAt, {
      now: new Date(),
      field: 'startedAt',
    });
    const draft = {
      ...auditActor(principal),
      ...request,
      action: 'run.sync.create',
      resourceType: 'run',
      resourceId: runId,
      projectId,
      details: {},
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        // オフラインの記録は手で動かすRun用。JobのRunはそのworkerがオンラインで書く。
        rejectJobToken(principal);
        await requireProject(connection, principal, {
          projectId,
          role: 'editor',
          scope: 'runs:write',
        });
        await lockSyncRunId(connection, runId);
        const existing = await findSyncRunOwnership(connection, runId, {
          lock: false,
        });
        if (existing) {
          assertSyncRunOwned(existing, {
            projectId,
            userId: principal.user.id,
          });
          return {
            run: await findRun(connection, { projectId, id: runId }),
            created: false,
          };
        }
        const queued = await this.dependencies.runs.insertRun(connection, {
          id: runId,
          projectId,
          createdBy: principal.user.id,
          input: {
            experimentId: input.experimentId,
            name: input.name,
            kind: input.kind,
            parameters: input.parameters,
            tags: input.tags,
            parentRunId: input.parentRunId,
            inputDatasetVersionIds: [],
            environment: {},
          },
        });
        const run = await markSyncRunStarted(connection, {
          runId,
          startedAt: input.startedAt,
          origin: input.origin ?? null,
        });
        await this.dependencies.runCompletion.recordStatusChange(connection, {
          previousStatus: queued.status,
          run,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            experimentId: input.experimentId,
            origin: run.syncOrigin ?? null,
          },
        });
        return { run, created: true };
      }),
    );
  }

  async applyBatch(
    principal: Principal,
    target: { projectId: string; runId: string; batch: SyncBatchInput },
  ): Promise<SyncBatchResult> {
    const { projectId, runId, batch } = target;
    assertNoReservedRunTags(batch.tags);
    if (batch.status)
      assertNotFutureTimestamp(batch.status.endedAt, {
        now: new Date(),
        field: 'endedAt',
      });
    return transaction(this.database, async (connection) => {
      rejectJobToken(principal);
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      // 行のロックで1つのRunのbatchを順に並べるので、状態のbatchとそれより古いbatchが
      // 入り混じらない。
      const ownership = await findSyncRunOwnership(connection, runId, {
        lock: true,
      });
      if (!ownership || ownership.projectId !== projectId) notFound('run');
      assertSyncRunOwned(ownership, { projectId, userId: principal.user.id });
      const counts = countBatch(batch);
      const claimed = await claimSyncBatch(connection, {
        projectId,
        runId,
        batchId: batch.batchId,
        sequence: batch.sequence,
        counts,
      });
      if (!claimed)
        return {
          applied: false,
          duplicate: true,
          counts: await findSyncBatchCounts(connection, {
            runId,
            batchId: batch.batchId,
          }),
        };
      const changedKeys = await findChangedParamKeys(connection, {
        runId,
        params: batch.params,
      });
      if (changedKeys.length > 0)
        throw new DomainError({
          status: 409,
          code: 'sync_param_conflict',
          message: `logged params cannot be changed to different values: ${changedKeys.join(', ')}`,
          details: { keys: changedKeys },
        });
      if (counts.params > 0 || counts.tags > 0)
        await mergeSyncRunRecords(connection, {
          runId,
          params: batch.params,
          tags: batch.tags,
        });
      // クライアントの時刻とstepを保つので、系列はその場で記録したように読める。
      if (counts.metrics > 0) await appendMetrics(connection, runId, batch.metrics);
      if (counts.logs > 0) await appendLogs(connection, runId, batch.logs);
      if (batch.status && (await this.endRun(connection, { projectId, runId, end: batch.status })))
        await recordSyncBatchStatus(connection, {
          runId,
          batchId: batch.batchId,
          status: batch.status.status,
        });
      return { applied: true, duplicate: false, counts };
    });
  }

  /**
   * クライアントの示した終わり方でRunを終える。既にその状態ならfalseを返す（終了が新しいbatchで
   * 送り直された場合）。違う終わり方は上書きせずに拒む。
   */
  private async endRun(
    connection: Connection,
    target: { projectId: string; runId: string; end: SyncBatchStatus },
  ): Promise<boolean> {
    const { projectId, runId, end } = target;
    const run = await findRun(connection, { projectId, id: runId });
    if (run.status === end.status) return false;
    if (isTerminalStatus(run.status))
      throw new DomainError({
        status: 409,
        code: 'sync_status_conflict',
        message: `the run already ended as ${run.status}, so it cannot become ${end.status}`,
        details: { runStatus: run.status, requestedStatus: end.status },
      });
    if (run.startedAt !== null && Date.parse(end.endedAt) < Date.parse(run.startedAt))
      throw new DomainError({
        status: 422,
        code: 'sync_ended_before_start',
        message: 'endedAt is before the start of the run',
      });
    const ended = await markSyncRunEnded(connection, {
      runId,
      status: end.status,
      endedAt: end.endedAt,
      error: end.error ?? null,
    });
    await this.dependencies.runCompletion.recordStatusChange(connection, {
      previousStatus: run.status,
      run: ended,
    });
    return true;
  }

  async checkArtifacts(
    principal: Principal,
    target: {
      projectId: string;
      runId: string;
      check: ArtifactPresenceCheckInput;
    },
  ): Promise<ArtifactPresence> {
    const { projectId, runId, check } = target;
    rejectJobToken(principal);
    // これを尋ねるのはアップロードしようとしているクライアントだけなので、アップロードと
    // 同じ権限を求める。
    await requireProject(this.database, principal, {
      projectId,
      role: 'editor',
      scope: 'artifacts:write',
    });
    await findRun(this.database, { projectId, id: runId });
    if (check.items.length === 0) return { present: [] };
    return {
      present: await findPresentArtifactPaths(this.database, {
        projectId,
        runId,
        items: check.items,
      }),
    };
  }
}
