import type {
  TargetCheck,
  TargetCheckRequest,
  TargetCheckWorkerPresence,
  TargetDirectoryListing,
  WorkerTargetCheck,
} from '@mmt/contracts';
import type { z } from 'zod';
import type { Principal } from '../auth/principal.js';
import type { ApiConfig } from '../config.js';
import { first, rows, transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import {
  isDirectoryListingResult,
  MAX_DIRECTORY_LISTING_RESULT_BYTES,
  MAX_TARGET_CHECK_RESULT_BYTES,
  rejectOversizedResult,
  rejectSecretsInListing,
  rejectSecretsInResult,
  type targetCheckClaimSchema,
  type targetCheckCompleteSchema,
} from '../domain/targetCheckValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  CHECK_COLUMNS,
  expireStaleChecks,
  findCheck,
  findClaimedRequest,
  findListing,
  insertConnectionCheck,
} from '../repositories/targetCheckRepository.js';
import { listCheckWorkers } from '../repositories/targetCheckWorkerRepository.js';
import { requireGlobalAdmin, requireWorker } from './accessService.js';
import { auditActor, recordDenial } from './auditService.js';
import { findCheckableTarget, findTarget, requireCheckWorker } from './targetCheckAccess.js';

// The Compute page shows recent history only.
const TARGET_CHECK_LIST_LIMIT = 20;

/**
 * What a worker may claim ($1 its token, $2 its MMT_WORKER_ID, $3 the kinds it runs, $4 its
 * MMT_WORKER_TARGET_IDS): a connection check nobody chose a worker for, of a computer it is in
 * charge of, or any request assigned to it.
 */
function claimableSql(table: string): string {
  return `${table}.kind=ANY($3::text[]) AND (
    (${table}.assigned_token_id IS NULL AND ${table}.target_id=ANY($4::uuid[]))
    OR (${table}.assigned_token_id=$1 AND ${table}.assigned_worker_id=$2))`;
}

/**
 * Connection checks of ssh and local computers, and the worker side of every request a worker runs
 * on a computer (connection checks and directory listings, TargetDirectoryListingService).
 */
export class TargetCheckService {
  constructor(
    private readonly database: Database,
    private readonly config: ApiConfig,
  ) {}

  async request(
    principal: Principal,
    targetId: string,
    request: TargetCheckRequest,
    metadata: RequestMetadata,
  ): Promise<TargetCheck> {
    const worker = request.worker ?? null;
    const draft = {
      ...auditActor(principal),
      ...metadata,
      action: 'compute_target.check',
      resourceType: 'compute_target',
      resourceId: targetId,
      details: { workerTokenId: worker?.tokenId ?? null, workerId: worker?.workerId ?? null },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await findCheckableTarget(connection, principal, targetId);
        if (worker) await requireCheckWorker(connection, worker);
        await expireStaleChecks(connection);
        const created = await insertConnectionCheck(connection, {
          targetId,
          requestedBy: principal.user.id,
          worker,
        });
        if (!created)
          throw new DomainError(
            409,
            'このコンピュータの接続確認は実行中です',
            'target_check_in_progress',
          );
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { ...draft.details, checkId: created.id },
        });
        return created;
      }),
    );
  }

  async list(principal: Principal, targetId: string): Promise<TargetCheck[]> {
    requireGlobalAdmin(principal);
    return transaction(this.database, async (connection) => {
      await findTarget(connection, targetId);
      await expireStaleChecks(connection);
      return rows<TargetCheck>(
        connection,
        `SELECT ${CHECK_COLUMNS} FROM target_checks WHERE target_id=$1 AND kind='connection'
        ORDER BY created_at DESC,id DESC LIMIT $2`,
        [targetId, TARGET_CHECK_LIST_LIMIT],
      );
    });
  }

  /**
   * Workers one may choose for a check: global administrators, who add ssh and local computers,
   * see every Project's workers.
   */
  async checkWorkers(principal: Principal): Promise<TargetCheckWorkerPresence[]> {
    requireGlobalAdmin(principal);
    return listCheckWorkers(this.database);
  }

  async claim(
    principal: Principal,
    request: z.infer<typeof targetCheckClaimSchema>,
  ): Promise<WorkerTargetCheck | null> {
    return transaction(this.database, async (connection) => {
      const worker = await requireWorker(connection, principal);
      // Serializes a worker's resent claims so one request cannot take two checks.
      await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `target-check:${worker.tokenId}:${request.workerId}`,
      ]);
      await expireStaleChecks(connection);
      // A lost claim response is recovered by claiming again: the same lease comes back.
      const held = await first<{ id: string }>(
        connection,
        `SELECT id FROM target_checks WHERE status='claimed' AND worker_token_id=$1 AND worker_id=$2
        AND ${claimableSql('target_checks')} AND NOT(id=ANY($5::uuid[])) ORDER BY claimed_at LIMIT 1`,
        [worker.tokenId, request.workerId, request.kinds, request.targetIds, request.activeCheckIds],
      );
      const claimedId =
        held?.id ??
        (
          await first<{ id: string }>(
            connection,
            `UPDATE target_checks SET status='claimed',worker_token_id=$1,worker_id=$2,
            lease_id=gen_random_uuid(),claimed_at=now()
            WHERE id=(SELECT c.id FROM target_checks c JOIN compute_targets t ON t.id=c.target_id
              WHERE c.status='queued' AND ${claimableSql('c')}
              AND ($5 OR t.executor<>'local')
              ORDER BY c.created_at,c.id LIMIT 1 FOR UPDATE OF c SKIP LOCKED)
            RETURNING id`,
            [
              worker.tokenId,
              request.workerId,
              request.kinds,
              request.targetIds,
              this.config.allowLocalExecutor,
            ],
          )
        )?.id;
      if (!claimedId) return null;
      const claimed = await findClaimedRequest(connection, claimedId);
      return { ...claimed, target: await findTarget(connection, claimed.check.targetId) };
    });
  }

  async complete(
    principal: Principal,
    checkId: string,
    request: z.infer<typeof targetCheckCompleteSchema>,
  ): Promise<TargetCheck | TargetDirectoryListing> {
    return transaction(this.database, async (connection) => {
      const worker = await requireWorker(connection, principal);
      const leased = await first<{
        status: TargetCheck['status'];
        failureReason: TargetCheck['failureReason'];
        targetId: string;
        kind: 'connection' | 'directory_listing';
      }>(
        connection,
        `SELECT status,failure_reason,target_id,kind FROM target_checks
        WHERE id=$1 AND worker_token_id=$2 AND lease_id=$3 FOR UPDATE`,
        [checkId, worker.tokenId, request.leaseId],
      );
      if (!leased) throw new DomainError(409, '接続確認のleaseが無効です', 'invalid_lease');
      const isListing = leased.kind === 'directory_listing';
      const recorded = () =>
        isListing
          ? findListing(connection, { targetId: leased.targetId, listingId: checkId })
          : findCheck(connection, checkId);
      if (leased.status !== 'claimed') {
        // A resent completion is safe; a timed-out request keeps its failure_reason.
        if (leased.status === request.status && leased.failureReason === null)
          return (await recorded())!;
        throw new DomainError(409, '接続確認は既に終了しています', 'target_check_finished');
      }
      if (isListing !== isDirectoryListingResult(request.result))
        throw new DomainError(
          422,
          '依頼の種類と結果の形が一致しません',
          'target_check_result_kind',
        );
      if (isDirectoryListingResult(request.result)) {
        rejectOversizedResult(request.result, MAX_DIRECTORY_LISTING_RESULT_BYTES);
        rejectSecretsInListing(request.result);
      } else {
        rejectOversizedResult(request.result, MAX_TARGET_CHECK_RESULT_BYTES);
        rejectSecretsInResult(request.result, await findTarget(connection, leased.targetId));
      }
      await connection.query(
        'UPDATE target_checks SET status=$2,result=$3,finished_at=now() WHERE id=$1',
        [checkId, request.status, request.result],
      );
      return (await recorded())!;
    });
  }
}
