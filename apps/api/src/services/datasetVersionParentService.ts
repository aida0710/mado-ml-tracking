import type { DatasetVersionParentPage } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { DatasetVersionParentCreateInput } from '../domain/datasetVersionParentValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findDatasetVersionParents,
  type DatasetVersionParentLocation,
} from '../repositories/datasetVersionParentRepository.js';
import {
  hasLineageAncestor,
  lockProjectLineage,
} from '../repositories/lineageMutationRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';
import { lockDatasetsOfVersions } from './datasetVersionReferences.js';

/** Supplements historical provenance without modifying content identity or training inputs. */
export class DatasetVersionParentService {
  constructor(private readonly database: Database) {}

  async get(
    principal: Principal,
    location: DatasetVersionParentLocation,
  ): Promise<DatasetVersionParentPage> {
    await requireProject(this.database, principal, {
      projectId: location.projectId,
      role: 'viewer',
      scope: 'read',
    });
    return findDatasetVersionParents(this.database, location);
  }

  async append(
    principal: Principal,
    registration: {
      location: DatasetVersionParentLocation;
      input: DatasetVersionParentCreateInput;
    },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<DatasetVersionParentPage> {
    const { location, input } = registration;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'dataset.version.parents.append',
      resourceType: 'dataset_version',
      resourceId: location.versionId,
      projectId: location.projectId,
      // Evidence may include private URLs; it is held by the protected provenance record.
      details: {
        datasetId: location.datasetId,
        parentDatasetVersionIds: input.parentDatasetVersionIds,
      },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, {
          projectId: location.projectId,
          role: 'editor',
          scope: 'registry:write',
        });
        await lockProjectLineage(connection, location.projectId);
        await lockDatasetsOfVersions(connection, {
          projectId: location.projectId,
          versionIds: [location.versionId, ...input.parentDatasetVersionIds],
        });
        const current = await findDatasetVersionParents(connection, location);
        const addedParents = input.parentDatasetVersionIds.filter(
          (id) => !current.parentDatasetVersionIds.includes(id),
        );
        if (!addedParents.length) return current;
        if (
          addedParents.includes(location.versionId) ||
          (await hasLineageAncestor(connection, {
            projectId: location.projectId,
            ancestorId: location.versionId,
            descendantIds: addedParents,
          }))
        )
          throw new DomainError({
            status: 422,
            code: 'dataset_parent_cycle',
            message: 'adding the parent makes the data lineage circular',
          });
        await connection.query(
          `INSERT INTO dataset_version_parent_additions
        (project_id,dataset_version_id,parent_dataset_version_id,reason,evidence,created_by)
        SELECT $1,$2,parent_id,$4,$5,$6 FROM unnest($3::uuid[]) AS parent_id`,
          [
            location.projectId,
            location.versionId,
            addedParents,
            input.reason,
            JSON.stringify(input.evidence),
            principal.user.id,
          ],
        );
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { datasetId: location.datasetId, parentDatasetVersionIds: addedParents },
        });
        return findDatasetVersionParents(connection, location);
      }),
    );
  }
}
