import type { TargetDirectoryListing, TargetDirectoryListingRequest } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  expireStaleChecks,
  findListing,
  findOpenListings,
  insertListing,
} from '../repositories/targetCheckRepository.js';
import { auditActor, recordDenial } from './auditService.js';
import { findCheckableTarget, requireCheckWorker } from './targetCheckAccess.js';

// Someone typing paths opens a few listings at once; more means a client stuck in a loop.
const MAX_OPEN_DIRECTORY_LISTINGS = 8;

/**
 * Reading one directory of an ssh or local computer through a chosen worker, so the work directory
 * and Python of a computer being set up can be completed beyond what its check found. The worker
 * side (claim, complete) is TargetCheckService's, as for connection checks.
 */
export class TargetDirectoryListingService {
  constructor(private readonly database: Database) {}

  /** The listing to wait for, and whether it was created now or already waited for this path. */
  async request(
    principal: Principal,
    targetId: string,
    request: TargetDirectoryListingRequest,
    metadata: RequestMetadata,
  ): Promise<{ listing: TargetDirectoryListing; created: boolean }> {
    const draft = {
      ...auditActor(principal),
      ...metadata,
      action: 'compute_target.directory_listing',
      resourceType: 'compute_target',
      resourceId: targetId,
      details: {
        path: request.path,
        workerTokenId: request.worker.tokenId,
        workerId: request.worker.workerId,
      },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await findCheckableTarget(connection, principal, targetId);
        await requireCheckWorker(connection, request.worker);
        await expireStaleChecks(connection);
        // Serializes requests for one computer so the open listings are counted once.
        await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `directory-listing:${targetId}`,
        ]);
        const open = await findOpenListings(connection, { targetId, ...request });
        if (open.samePath) return { listing: open.samePath, created: false };
        if (open.count >= MAX_OPEN_DIRECTORY_LISTINGS)
          throw new DomainError({
            status: 409,
            code: 'directory_listing_limit',
            message: 'too many directory reads are waiting for this computer',
          });
        const listing = await insertListing(connection, {
          targetId,
          requestedBy: principal.user.id,
          ...request,
        });
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { ...draft.details, listingId: listing.id },
        });
        return { listing, created: true };
      }),
    );
  }

  async get(
    principal: Principal,
    location: { targetId: string; listingId: string },
  ): Promise<TargetDirectoryListing> {
    return transaction(this.database, async (connection) => {
      await findCheckableTarget(connection, principal, location.targetId);
      await expireStaleChecks(connection);
      const listing = await findListing(connection, location);
      if (!listing) notFound('directory read');
      return listing;
    });
  }
}
