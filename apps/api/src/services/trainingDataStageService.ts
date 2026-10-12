import {
  isTrainingRunKind,
  type TrainingDataStage,
  type TrainingDataStagePage,
} from '@mmt/contracts';
import { isDeepStrictEqual } from 'node:util';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { TrainingDataStageCreateInput } from '../domain/trainingDataStageValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { findCheckpoint } from '../repositories/checkpointRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import { listTrainingDataStages } from '../repositories/trainingDataStageRepository.js';
import {
  hasLineageAncestor,
  lockProjectLineage,
} from '../repositories/lineageMutationRepository.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { requireProject } from './accessService.js';
import { auditActor, NO_REQUEST_METADATA } from './auditService.js';
import { assertInputDatasetVersionsUsable } from './datasetVersionReferences.js';
import { assertRunRecordsWritable } from './runService.js';

/** Records the data a training loader used from a step, without changing the loader itself. */
export class TrainingDataStageService {
  constructor(private readonly database: Database) {}

  async list(
    principal: Principal,
    reference: { projectId: string; runId: string },
  ): Promise<TrainingDataStagePage> {
    await requireProject(this.database, principal, {
      projectId: reference.projectId,
      role: 'viewer',
      scope: 'read',
    });
    const run = await findRun(this.database, {
      projectId: reference.projectId,
      id: reference.runId,
    });
    return {
      initialStep: await this.initialStep(run),
      initialDatasetVersionIds: run.inputDatasetVersionIds,
      items: await listTrainingDataStages(this.database, reference),
    };
  }

  async append(
    principal: Principal,
    registration: { projectId: string; runId: string; input: TrainingDataStageCreateInput },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<TrainingDataStage> {
    const { projectId, runId, input } = registration;
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      await lockProjectLineage(connection, projectId);
      const run = await findRun(connection, { projectId, id: runId, lock: true });
      if (!isTrainingRunKind(run.kind))
        throw new DomainError(
          422,
          '学習データの履歴はtrainingまたはfinetuningのRunに記録してください',
          'training_data_run_kind',
        );
      if ((run as { lifecycleStage?: string }).lifecycleStage === 'deleted')
        throw new DomainError(
          422,
          '削除済みRunには学習データを記録できません',
          'source_run_deleted',
        );
      const stages = await listTrainingDataStages(connection, { projectId, runId });
      const existing = stages.find((stage) => stage.startStep === input.startStep);
      if (existing) {
        if (
          existing.checkpointId !== input.checkpointId ||
          !isDeepStrictEqual(
            [...existing.inputDatasetVersionIds].sort(),
            [...input.inputDatasetVersionIds].sort(),
          ) ||
          !isDeepStrictEqual(existing.metadata, input.metadata)
        )
          throw new DomainError(
            409,
            'このstepには別の学習データが記録されています',
            'training_data_stage_conflict',
          );
        return existing;
      }
      await assertRunRecordsWritable(connection, run);
      const initialStep = run.resumeCheckpointId
        ? (await findCheckpoint(connection, { projectId, id: run.resumeCheckpointId })).step + 1
        : 0;
      if (
        input.startStep < initialStep ||
        (stages.length && input.startStep <= stages.at(-1)!.startStep)
      )
        throw new DomainError(
          409,
          '記録済みのstepより後の学習データを追加してください',
          'training_data_stage_order',
        );
      if (input.checkpointId) {
        const checkpoint = await findCheckpoint(connection, { projectId, id: input.checkpointId });
        if (checkpoint.runId !== run.id || checkpoint.step >= input.startStep)
          throw new DomainError(
            422,
            'このRunの開始stepより前のcheckpointを選んでください',
            'training_data_stage_checkpoint',
          );
      }
      await assertInputDatasetVersionsUsable(connection, {
        projectId,
        ids: input.inputDatasetVersionIds,
      });
      if (
        await hasLineageAncestor(connection, {
          projectId,
          ancestorId: runId,
          descendantIds: input.inputDatasetVersionIds,
        })
      )
        throw new DomainError(
          422,
          'このRunの出力から作られたデータは入力に追加できません',
          'training_data_stage_cycle',
        );
      const stage = (await first<TrainingDataStage>(
        connection,
        `INSERT INTO training_data_stages
        (project_id,run_id,start_step,input_dataset_version_ids,checkpoint_id,metadata,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,start_step::float8 AS start_step`,
        [
          projectId,
          runId,
          input.startStep,
          input.inputDatasetVersionIds,
          input.checkpointId,
          JSON.stringify(input.metadata),
          principal.user.id,
        ],
      ))!;
      await writeAuditEvent(connection, {
        ...auditActor(principal),
        ...request,
        action: 'run.training_data_stage.append',
        resourceType: 'run',
        resourceId: runId,
        projectId,
        outcome: 'success',
        details: {
          stageId: stage.id,
          startStep: stage.startStep,
          datasetVersionIds: stage.inputDatasetVersionIds,
          ...(principal.token?.job
            ? { jobId: principal.token.job.jobId, runCreatedBy: principal.user.id }
            : {}),
        },
      });
      return stage;
    });
  }

  private async initialStep(run: {
    projectId: string;
    resumeCheckpointId?: string | null;
  }): Promise<number> {
    return run.resumeCheckpointId
      ? (
          await findCheckpoint(this.database, {
            projectId: run.projectId,
            id: run.resumeCheckpointId,
          })
        ).step + 1
      : 0;
  }
}
