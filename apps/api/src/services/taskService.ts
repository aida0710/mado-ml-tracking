import type {
  CodeVersion,
  JsonObject,
  ExperimentTask,
  Run,
  RunKind,
  TaskExecution,
  TaskOutputModel,
  TaskRunPage,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { validateCodeCompatibility } from '../domain/compatibility.js';
import { conflict, DomainError, notFound } from '../domain/errors.js';
import { assertNoReservedRunTags } from '../domain/reservedRunTags.js';
import {
  MAX_TASK_REVISION,
  type TaskCreate,
  type TaskDefaults,
  type TaskHistoryQuery,
  type TaskLaunch,
  type TaskPatch,
} from '../domain/experimentTaskValidation.js';
import { findTask, insertTask, updateTask } from '../repositories/experimentTaskRepository.js';
import {
  findCodeVersion,
  findModelVersion,
  lockActiveExperiment,
} from '../repositories/registryRepository.js';
import { validateCodeArtifacts } from '../repositories/runtimeArtifactRepository.js';
import { runSummarySelect } from '../repositories/runListProjection.js';
import {
  findOutputModelById,
  findOutputModelByName,
} from '../repositories/runOutputRegistrationRepository.js';
import { requireProject, requireScope } from './accessService.js';
import { pinResumeCheckpoint } from './checkpointResume.js';
import { assertInputDatasetVersionsUsable } from './datasetVersionReferences.js';
import type { JobService } from './jobService.js';
import type { RunService } from './runService.js';

// Task launch and ordinary Job creation share the same retry policy.
const TASK_JOB_MAX_ATTEMPTS = 3;
// Same kinds registerModelVersion accepts as an output model's source Run.
const OUTPUT_MODEL_TASK_KINDS: readonly RunKind[] = ['training', 'finetuning'];

/** Launch overrides once the revision check is done. */
export type TaskLaunchOptions = Omit<TaskLaunch, 'expectedRevision'>;

export class TaskService {
  constructor(
    private readonly database: Database,
    private readonly runs: RunService,
    private readonly jobs: JobService,
  ) {}

  async list(
    principal: Principal,
    projectId: string,
    experimentId?: string,
  ): Promise<ExperimentTask[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    if (experimentId) {
      const experiment = await first(
        this.database,
        'SELECT id FROM experiments WHERE id=$1 AND project_id=$2',
        [experimentId, projectId],
      );
      if (!experiment) notFound('experiment');
    }
    return rows(
      this.database,
      `SELECT * FROM experiment_tasks WHERE project_id=$1 AND ($2::uuid IS NULL OR experiment_id=$2) ORDER BY created_at DESC,id DESC`,
      [projectId, experimentId ?? null],
    );
  }

  async get(principal: Principal, projectId: string, taskId: string): Promise<ExperimentTask> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return findTask(this.database, { projectId, id: taskId });
  }

  async create(
    principal: Principal,
    projectId: string,
    input: TaskCreate,
  ): Promise<ExperimentTask> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'registry:write',
      });
      await lockActiveExperiment(connection, { projectId, id: input.experimentId });
      await this.validateDefaults(connection, { projectId, input, userId: principal.user.id });
      return insertTask(connection, { projectId, input });
    });
  }

  async patch(
    principal: Principal,
    projectId: string,
    request: { taskId: string; input: TaskPatch },
  ): Promise<ExperimentTask> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'registry:write',
      });
      const task = await this.lockTask(connection, { projectId, id: request.taskId });
      this.validateRevision(task, request.input.expectedRevision);
      if (task.revision === MAX_TASK_REVISION) conflict('the task has reached the revision limit');
      const { expectedRevision: _expectedRevision, ...changes } = request.input;
      const updated = {
        ...task,
        ...changes,
        outputModel:
          changes.outputModel === undefined ? (task.outputModel ?? null) : changes.outputModel,
      };
      await this.validateDefaults(connection, {
        projectId,
        input: updated,
        userId: principal.user.id,
      });
      return updateTask(connection, updated);
    });
  }

  async launch(
    principal: Principal,
    projectId: string,
    request: { taskId: string; input: TaskLaunch },
  ): Promise<TaskExecution> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      requireScope(principal, 'jobs:write');
      const task = await this.lockTask(connection, { projectId, id: request.taskId });
      const { expectedRevision, ...input } = request.input;
      this.validateRevision(task, expectedRevision);
      return this.launchTaskInTransaction(connection, {
        task,
        input,
        createdBy: principal.user.id,
      });
    });
  }

  /**
   * Creates the Run and Job of one Task launch. The caller has authorized the launch, locked the
   * Task's Experiment and checked its revision. serverTags are reserved tags (mmt.*) that only
   * server-side launchers such as sweeps set; they are added on top of the Task's tags.
   */
  async launchTaskInTransaction(
    connection: Connection,
    launch: {
      task: ExperimentTask;
      input: TaskLaunchOptions;
      createdBy: string;
      serverTags?: Record<string, string>;
      lineage?: { parentRunId: string | null; upstreamDatasetVersionIds: string[] };
      environment?: JsonObject;
    },
  ): Promise<TaskExecution> {
    const { task, input } = launch;
    const targetId = input.targetId ?? task.targetId;
    if (!targetId)
      throw new DomainError({
        status: 422,
        code: 'target_required',
        message: 'specify the computer to run on',
      });
    const insertedRun = await this.runs.insertRun(connection, {
      projectId: task.projectId,
      createdBy: launch.createdBy,
      task: { id: task.id, revision: task.revision },
      upstreamDatasetVersionIds: launch.lineage?.upstreamDatasetVersionIds,
      input: {
        experimentId: task.experimentId,
        name: input.name ?? task.name,
        kind: task.kind,
        codeVersionId: task.codeVersionId,
        executionMode: input.executionMode,
        modelVersionId:
          input.modelVersionId === undefined ? task.modelVersionId : input.modelVersionId,
        inputDatasetVersionIds: input.inputDatasetVersionIds ?? task.inputDatasetVersionIds,
        parameters: { ...task.parameters, ...input.parameters },
        tags: { ...task.tags, ...launch.serverTags },
        parentRunId: launch.lineage?.parentRunId,
        environment: launch.environment ?? {},
      },
    });
    const run = input.resumeCheckpointId
      ? await pinResumeCheckpoint(connection, {
          run: insertedRun,
          checkpointId: input.resumeCheckpointId,
        })
      : insertedRun;
    const job = await this.jobs.insertJob(connection, {
      run,
      input: {
        runId: run.id,
        targetId,
        gpuIds: input.gpuIds ?? task.gpuIds,
        gpuCount: input.gpuCount ?? task.gpuCount,
        walltimeSeconds:
          input.walltimeSeconds === undefined ? task.walltimeSeconds : input.walltimeSeconds,
        maxAttempts: TASK_JOB_MAX_ATTEMPTS,
      },
      attempt: 1,
    });
    return { run, job };
  }

  async history(
    principal: Principal,
    projectId: string,
    request: TaskHistoryQuery & { taskId: string },
  ): Promise<TaskRunPage> {
    await this.get(principal, projectId, request.taskId);
    // Preserve PostgreSQL microseconds; JavaScript Date would truncate the keyset boundary.
    const boundary = request.cursor
      ? await first<{ id: string; createdAt: string }>(
          this.database,
          'SELECT id,created_at::text AS created_at FROM runs WHERE project_id=$1 AND task_id=$2 AND id=$3',
          [projectId, request.taskId, request.cursor],
        )
      : undefined;
    if (request.cursor && !boundary) notFound('run cursor');
    const page = await rows<Run>(
      this.database,
      `${runSummarySelect} WHERE project_id=$1 AND task_id=$2 AND lifecycle_stage='active'
      AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid))
      ORDER BY created_at DESC,id DESC LIMIT $5`,
      [
        projectId,
        request.taskId,
        boundary?.createdAt ?? null,
        boundary?.id ?? null,
        request.limit + 1,
      ],
    );
    const items = page.slice(0, request.limit);
    return {
      items,
      nextCursor: page.length > request.limit ? items.at(-1)!.id : null,
    };
  }

  private async lockTask(
    connection: Connection,
    reference: { projectId: string; id: string },
  ): Promise<ExperimentTask> {
    const task = await findTask(connection, reference);
    // Experiment precedes Task and Run locks, matching MLflow lifecycle mutations.
    await lockActiveExperiment(connection, {
      projectId: reference.projectId,
      id: task.experimentId,
    });
    return findTask(connection, { ...reference, lock: true });
  }

  private validateRevision(task: ExperimentTask, expectedRevision: number): void {
    if (task.revision !== expectedRevision)
      throw new DomainError({
        status: 409,
        code: 'task_revision_conflict',
        message: 'the task has been updated; check the latest revision',
      });
  }

  // userId: who saves the Task; launching it later checks the person who launches.
  private async validateDefaults(
    connection: Connection,
    registration: { projectId: string; input: TaskDefaults; userId: string },
  ): Promise<void> {
    const { projectId, input } = registration;
    const code = await findCodeVersion(connection, { projectId, id: input.codeVersionId });
    const model = input.modelVersionId
      ? await findModelVersion(connection, { projectId, id: input.modelVersionId })
      : null;
    validateCodeCompatibility(code, { model, kind: input.kind });
    await validateCodeArtifacts(connection, code);
    assertNoReservedRunTags(input.tags);
    if (input.outputModel)
      await this.validateOutputModel(connection, {
        projectId,
        kind: input.kind,
        code,
        outputModel: input.outputModel,
      });
    await assertInputDatasetVersionsUsable(connection, {
      projectId,
      ids: input.inputDatasetVersionIds,
    });
    if (input.targetId)
      await this.jobs.validateTarget(connection, {
        targetId: input.targetId,
        gpuIds: input.gpuIds,
        gpuCount: input.gpuCount,
        runtime: code.runtime,
        usage: { userId: registration.userId },
      });
  }

  // The registration itself runs later as the Run's creator; checking here turns a Task that
  // could never register into a 422 at save time instead of a failed record after training.
  private async validateOutputModel(
    connection: Connection,
    request: { projectId: string; kind: RunKind; code: CodeVersion; outputModel: TaskOutputModel },
  ): Promise<void> {
    const { projectId, code, outputModel } = request;
    if (!OUTPUT_MODEL_TASK_KINDS.includes(request.kind))
      throw new DomainError({
        status: 422,
        code: 'output_model_kind',
        message: 'output models can be set only for training or finetuning tasks',
      });
    const family = outputModel.createModel
      ? await familyForNewModel(connection, { projectId, createModel: outputModel.createModel })
      : await familyOfExistingModel(connection, { projectId, id: outputModel.modelId! });
    validateCodeCompatibility(code, { model: { family } });
    if (outputModel.defaultCodeVersionId)
      validateCodeCompatibility(
        await findCodeVersion(connection, { projectId, id: outputModel.defaultCodeVersionId }),
        { model: { family } },
      );
  }
}

async function familyOfExistingModel(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<string> {
  const model = await findOutputModelById(connection, reference);
  if (!model) notFound('model');
  if (model.deleted)
    throw new DomainError({
      status: 422,
      code: 'model_deleted',
      message: 'a model deleted through MLflow cannot be the destination',
    });
  return model.family;
}

// An existing Model with the same name is reused at registration, so its family must match.
async function familyForNewModel(
  connection: Connection,
  request: { projectId: string; createModel: { name: string; family: string } },
): Promise<string> {
  const { createModel } = request;
  const existing = await findOutputModelByName(connection, {
    projectId: request.projectId,
    name: createModel.name,
  });
  if (existing && existing.family !== createModel.family)
    throw new DomainError({
      status: 422,
      code: 'model_family_mismatch',
      message: `a model with the same name is registered in family ${existing.family}`,
      details: { modelFamily: existing.family },
    });
  return createModel.family;
}
