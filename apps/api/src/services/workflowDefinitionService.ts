import type {
  ExperimentTask,
  Workflow,
  WorkflowCreate,
  WorkflowDetail,
  WorkflowStep,
  WorkflowStepInput,
  WorkflowVersion,
  WorkflowVersionCreate,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { validateWorkflowOrder } from '../domain/workflowValidation.js';
import { lockActiveExperiment } from '../repositories/registryRepository.js';
import {
  findWorkflow,
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
    return {
      workflow,
      versions: await listWorkflowVersions(this.database, { projectId, workflowId }),
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
      return { workflow, versions: [version] };
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
        throw new DomainError(
          409,
          'ワークフローが更新されています。最新のバージョンを開いてください',
          'workflow_revision_conflict',
        );
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
    const ids = [...new Set(request.inputs.map((step) => step.taskId.toLowerCase()))];
    const candidates = await rows<ExperimentTask>(
      connection,
      'SELECT * FROM experiment_tasks WHERE project_id=$1 AND id=ANY($2::uuid[]) ORDER BY id',
      [request.projectId, ids],
    );
    if (candidates.length !== ids.length) notFound('Task');
    // Task edits lock Experiment before Task; definitions use the same order.
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
    return request.inputs.map((step) => {
      const task = byId.get(step.taskId.toLowerCase())!;
      if (task.revision !== step.expectedTaskRevision)
        throw new DomainError(
          409,
          'Taskが更新されています。最新の設定で保存してください',
          'task_revision_conflict',
        );
      if (!task.targetId)
        throw new DomainError(
          422,
          '各Taskに実行するコンピュータを設定してください',
          'target_required',
        );
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
  }
}
