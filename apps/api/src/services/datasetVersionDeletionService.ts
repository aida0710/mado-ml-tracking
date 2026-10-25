import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { notFound } from '../domain/errors.js';
import { assertDatasetVersionUnused } from '../domain/datasetVersionUsage.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  countDatasetVersionReferences,
  deleteDatasetVersionWithFiles,
} from '../repositories/datasetVersionDeletionRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

/**
 * Deletes a DatasetVersion nothing refers to, such as one registered with a mistyped URI
 * (DELETE /projects/:p/datasets/:d/versions/:v). Editors may, as they may register one.
 */
export class DatasetVersionDeletionService {
  constructor(private readonly database: Database) {}

  async delete(
    principal: Principal,
    location: { projectId: string; datasetId: string; versionId: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const { projectId, datasetId, versionId } = location;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'dataset.version.delete',
      resourceType: 'dataset_version',
      resourceId: versionId,
      projectId,
      details: { datasetId },
    };
    await recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, {
          projectId,
          role: 'editor',
          scope: 'registry:write',
        });
        // A new reference kept in an array or JSON (the inputs of a Run, Task, rule or hook, a
        // version's parents) locks the version's Dataset first (lockDatasetsOfVersions), so it is
        // either counted below or waits and then finds the version gone. References with a
        // foreign key (Job partitions, output declarations, MLflow inputs) are the database's.
        const dataset = await first(
          connection,
          'SELECT id FROM datasets WHERE project_id=$1 AND id=$2 FOR UPDATE',
          [projectId, datasetId],
        );
        if (!dataset) notFound('dataset');
        const version = await first<{ version: string; digest: string }>(
          connection,
          'SELECT version,digest FROM dataset_versions WHERE project_id=$1 AND dataset_id=$2 AND id=$3 FOR UPDATE',
          [projectId, datasetId, versionId],
        );
        if (!version) notFound('dataset version');
        assertDatasetVersionUnused(
          await countDatasetVersionReferences(connection, { projectId, id: versionId }),
        );
        await deleteDatasetVersionWithFiles(connection, { projectId, id: versionId });
        // The audit log keeps every event for good, and a URI may carry a signed query, so the
        // event names the version without it.
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { datasetId, version: version.version, digest: version.digest },
        });
      }),
    );
  }
}
