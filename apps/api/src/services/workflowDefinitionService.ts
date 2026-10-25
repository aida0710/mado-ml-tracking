import type {
  ExperimentTask,
  Workflow,
  WorkflowCreate,
  WorkflowDetail,
  WorkflowStep,
  WorkflowStepInput,
  WorkflowVersion,
  WorkflowVersionCreate,
  WorkflowVersionPage,
} from '@mmt/contracts';
import { WORKFLOW_VERSIONS_PAGE_SIZE } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import {
  validateModelSources,
  validateQualityGateMetrics,
  validateWorkflowOrder,
} from '../domain/workflowValidation.js';
import { lockActiveExperiment } from '../repositories/registryRepository.js';
import {
  findWorkflow,
  findWorkflowVersionById,
  insertWorkflowVersion,
  listWorkflowVersions,
} from '../repositories/workflowDefinitionRepository.js';
import { requireProject } from './accessService.js';
import { assertInputDatasetVersionsUsable } from './datasetVersionReferences.js';

export class WorkflowDefinitionService {
  constructor(private readonly database: Database) {}

  async list(principal: Principal, projectId: string): Promise<Workflow[]> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    return rows(
      this.database,
      'SELECT * FROM workflows WHERE project_id=$1 ORDER BY created_at DESC,id DESC',
      [projectId],
    );
  }

  async get(principal: Principal, projectId: string, workflowId: string): Promise<WorkflowDetail> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const workflow = await findWorkflow(this.database, { projectId, id: workflowId });
    const newest = await this.versionPage(this.database, {
      projectId,
      workflowId,
      beforeRevision: null,
    });
    return { workflow, versions: newest.items, olderVersionsCursor: newest.nextCursor };
  }

  /** cursor（前のページの最後のバージョン）より古いバージョン。新しい順。 */
  async listVersions(
    principal: Principal,
    projectId: string,
    request: { workflowId: string; cursor?: string },
  ): Promise<WorkflowVersionPage> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const workflow = await findWorkflow(this.database, { projectId, id: request.workflowId });
    const boundary = request.cursor
      ? await findWorkflowVersionById(this.database, {
          projectId,
          workflowId: workflow.id,
          id: request.cursor,
        })
      : null;
    return this.versionPage(this.database, {
      projectId,
      workflowId: workflow.id,
      beforeRevision: boundary?.revision ?? null,
    });
  }

  private async versionPage(
    connection: Connection,
    page: { projectId: string; workflowId: string; beforeRevision: number | null },
  ): Promise<WorkflowVersionPage> {
    const versions = await listWorkflowVersions(connection, {
      ...page,
      limit: WORKFLOW_VERSIONS_PAGE_SIZE + 1,
    });
    const items = versions.slice(0, WORKFLOW_VERSIONS_PAGE_SIZE);
    return {
      items,
      nextCursor: versions.length > WORKFLOW_VERSIONS_PAGE_SIZE ? items.at(-1)!.id : null,
    };
  }

  async create(
    principal: Principal,
    projectId: string,
    input: WorkflowCreate,
  ): Promise<WorkflowDetail> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'registry:write',
      });
      const steps = await this.pinSteps(connection, { projectId, inputs: input.steps });
      const workflow = (await first<Workflow>(
        connection,
        'INSERT INTO workflows(project_id,name,description,created_by) VALUES($1,$2,$3,$4) RETURNING *',
        [projectId, input.name, input.description ?? '', principal.user.id],
      ))!;
      const version = await insertWorkflowVersion(connection, {
        workflow,
        steps,
        createdBy: principal.user.id,
        revision: 1,
      });
      return { workflow, versions: [version], olderVersionsCursor: null };
    });
  }

  async createVersion(
    principal: Principal,
    projectId: string,
    request: { workflowId: string; input: WorkflowVersionCreate },
  ): Promise<WorkflowVersion> {
    return transaction(this.database, async (connection) => {
      await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'registry:write',
      });
      const workflow = await findWorkflow(connection, {
        projectId,
        id: request.workflowId,
        lock: true,
      });
      if (workflow.latestRevision !== request.input.expectedRevision)
        throw new DomainError({
          status: 409,
          code: 'workflow_revision_conflict',
          message: 'the workflow has been updated; open the latest version',
        });
      const steps = await this.pinSteps(connection, { projectId, inputs: request.input.steps });
      return insertWorkflowVersion(connection, {
        workflow,
        steps,
        createdBy: principal.user.id,
        revision: workflow.latestRevision + 1,
      });
    });
  }

  private async pinSteps(
    connection: Connection,
    request: { projectId: string; inputs: WorkflowStepInput[] },
  ): Promise<WorkflowStep[]> {
    validateWorkflowOrder(request.inputs);
    validateQualityGateMetrics(request.inputs);
    const ids = [...new Set(request.inputs.map((step) => step.taskId.toLowerCase()))];
    const candidates = await rows<ExperimentTask>(
      connection,
      'SELECT * FROM experiment_tasks WHERE project_id=$1 AND id=ANY($2::uuid[]) ORDER BY id',
      [request.projectId, ids],
    );
    if (candidates.length !== ids.length) notFound('task');
    // Taskの編集はExperimentをTaskより先にロックする。ワークフローの定義も同じ順にする。
    for (const experimentId of [...new Set(candidates.map((task) => task.experimentId))].sort())
      await lockActiveExperiment(connection, { projectId: request.projectId, id: experimentId });
    const pinnedTasks = await rows<ExperimentTask>(
      connection,
      'SELECT * FROM experiment_tasks WHERE project_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',
      [request.projectId, ids],
    );
    const byId = new Map(pinnedTasks.map((task) => [task.id, task]));
    const fixedIds = request.inputs.flatMap((step) =>
      step.inputs.flatMap((binding) =>
        binding.source.kind === 'dataset' ? [binding.source.datasetVersionId] : [],
      ),
    );
    await assertInputDatasetVersionsUsable(connection, {
      projectId: request.projectId,
      ids: [...new Set(fixedIds)],
    });
    const steps = request.inputs.map((step) => {
      const task = byId.get(step.taskId.toLowerCase())!;
      if (task.revision !== step.expectedTaskRevision)
        throw new DomainError({
          status: 409,
          code: 'task_revision_conflict',
          message: 'the task has been updated; save with the latest settings',
        });
      if (!task.targetId)
        throw new DomainError({
          status: 422,
          code: 'target_required',
          message: 'set the computer to run on for each task',
        });
      const { taskId: _taskId, expectedTaskRevision: _revision, ...definition } = step;
      return {
        ...definition,
        task,
        inputs: definition.inputs.map((input) => ({
          ...input,
          source:
            input.source.kind === 'dataset'
              ? { ...input.source, datasetVersionId: input.source.datasetVersionId.toLowerCase() }
              : input.source,
        })),
      };
    });
    validateModelSources(steps);
    return steps;
  }
}
