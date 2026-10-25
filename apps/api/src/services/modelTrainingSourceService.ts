import type { ModelVersionTrainingSource } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import type { ModelTrainingSourceCreateInput } from '../domain/modelTrainingSourceValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findModelTrainingSource,
  type ModelTrainingSourceLocation,
} from '../repositories/modelTrainingSourceRepository.js';
import { hasLineageAncestor, lockProjectLineage } from '../repositories/lineageMutationRepository.js';
import { findModelVersion } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';
import { lockOutputSourceRun } from '../repositories/modelOutputSourceRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import type { RunService } from './runService.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import { matchesHistoricalTrainingRun } from '../domain/historicalTrainingRun.js';

/** Appends historical provenance without registering weights again or launching automation. */
export class ModelTrainingSourceService {
  constructor(
    private readonly database: Database,
    private readonly runs: RunService,
  ) {}

  async get(
    principal: Principal,
    location: ModelTrainingSourceLocation,
  ): Promise<ModelVersionTrainingSource | null> {
    await requireProject(this.database, principal, {
      projectId: location.projectId,
      role: 'viewer',
      scope: 'read',
    });
    await this.assertVersion(location);
    return findModelTrainingSource(this.database, location);
  }

  async associate(
    principal: Principal,
    registration: { location: ModelTrainingSourceLocation; input: ModelTrainingSourceCreateInput },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<ModelVersionTrainingSource> {
    const { location, input } = registration;
    const existingRunId = 'runId' in input ? input.runId : undefined;
    const historicalInput = 'run' in input ? input.run : undefined;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'model.training_source.associate',
      resourceType: 'model_version',
      resourceId: location.versionId,
      projectId: location.projectId,
      // Evidence can contain private recipe URLs; the audit records only the relationship.
      details: { modelId: location.modelId, ...(existingRunId ? { runId: existingRunId } : {}) },
    };
    return recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, {
          projectId: location.projectId,
          role: 'editor',
          scope: 'registry:write',
        });
        await requireProject(connection, principal, {
          projectId: location.projectId,
          role: 'editor',
          scope: 'runs:write',
        });
        await lockProjectLineage(connection, location.projectId);
        const version = await findModelVersion(connection, {
          projectId: location.projectId,
          id: location.versionId,
        });
        if (version.modelId !== location.modelId) notFound('model version');
        const existing = await findModelTrainingSource(connection, location);
        if (existing) {
          const sameRun = existingRunId
            ? existing.runId === existingRunId
            : historicalInput &&
              existing.origin === 'association' &&
              matchesHistoricalTrainingRun(
                await findRun(connection, { projectId: location.projectId, id: existing.runId }),
                historicalInput,
              );
          if (!sameRun)
            throw new DomainError({
              status: 409,
              code: 'model_training_source_conflict',
              message: 'another training source is already recorded for this model version',
            });
          return existing;
        }
        let runId = existingRunId;
        if (historicalInput) {
          assertNoReservedRunTags(historicalInput.tags);
          const historical = await this.runs.insertRun(connection, {
            projectId: location.projectId,
            createdBy: principal.user.id,
            input: historicalInput,
          });
          // Backfilled history is already complete. Completion hooks belong to newly executed Runs.
          await connection.query(
            "UPDATE runs SET status='finished',started_at=$2,ended_at=$3 WHERE id=$1",
            [historical.id, historicalInput.startedAt, historicalInput.endedAt],
          );
          runId = historical.id;
        }
        const run = await lockOutputSourceRun(connection, {
          projectId: location.projectId,
          id: runId!,
        });
        if (!isTerminalStatus(run.status))
          throw new DomainError({
            status: 422,
            code: 'model_training_source_not_terminal',
            message: 'choose a finished training run',
          });
        const deletedVersion = await first(
          connection,
          `SELECT 1 FROM mlflow_model_version_metadata
        WHERE version_id=$1 AND deleted_at IS NOT NULL`,
          [version.id],
        );
        if (deletedVersion) notFound('model version');
        if (
          await hasLineageAncestor(connection, {
            projectId: location.projectId,
            ancestorId: version.id,
            descendantIds: [run.id],
          })
        )
          throw new DomainError({
            status: 422,
            code: 'model_training_source_cycle',
            message: 'the model version is an input or an ancestor of the training source',
          });
        await connection.query(
          `INSERT INTO model_version_training_sources(model_version_id,project_id,run_id,evidence,created_by)
        VALUES($1,$2,$3,$4,$5)`,
          [
            version.id,
            location.projectId,
            run.id,
            JSON.stringify(input.evidence),
            principal.user.id,
          ],
        );
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            ...draft.details,
            runId: run.id,
            historicalRunCreated: Boolean(historicalInput),
          },
        });
        return (await findModelTrainingSource(connection, location))!;
      }),
    );
  }

  private async assertVersion(location: ModelTrainingSourceLocation): Promise<void> {
    const version = await findModelVersion(this.database, {
      projectId: location.projectId,
      id: location.versionId,
    });
    if (version.modelId !== location.modelId) notFound('model version');
  }
}
