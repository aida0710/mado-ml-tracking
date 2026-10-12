import { createHash } from 'node:crypto';
import type {
  ProjectRole,
  WorkflowExecution,
  WorkflowExecutionPage,
  WorkflowLaunch,
  WorkflowStepExecution,
  WorkflowVersion,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { assertControlsWorkflowExecution } from '../domain/workflowExecutionControl.js';
import { findRun } from '../repositories/registryRepository.js';
import { findWorkflow, findWorkflowVersion } from '../repositories/workflowDefinitionRepository.js';
import {
  findWorkflowExecution,
  findWorkflowExecutionSummary,
  finishWorkflowExecution,
  insertWorkflowExecution,
  insertWorkflowStepExecution,
  listWorkflowStepExecutions,
  workflowExecutionColumns,
} from '../repositories/workflowExecutionRepository.js';
import { requireProject, requireScope } from './accessService.js';
import type { JobService } from './jobService.js';
import type { WorkflowExecutor } from './workflowExecutor.js';

export class WorkflowExecutionService {
  constructor(
    private readonly options: { database: Database; jobs: JobService; executor: WorkflowExecutor },
  ) {}

  async get(
    principal: Principal,
    projectId: string,
    executionId: string,
  ): Promise<WorkflowExecution> {
    await requireProject(this.options.database, principal, {
      projectId,
      role: 'viewer',
      scope: 'read',
    });
    return findWorkflowExecution(this.options.database, { projectId, id: executionId });
  }

  async history(
    principal: Principal,
    projectId: string,
    request: { workflowId: string; limit: number; cursor?: string },
  ): Promise<WorkflowExecutionPage> {
    await requireProject(this.options.database, principal, {
      projectId,
      role: 'viewer',
      scope: 'read',
    });
    await findWorkflow(this.options.database, { projectId, id: request.workflowId });
    const boundary = request.cursor
      ? await first<{ id: string; createdAt: string }>(
          this.options.database,
          'SELECT id,created_at::text AS created_at FROM workflow_executions WHERE project_id=$1 AND workflow_id=$2 AND id=$3',
          [projectId, request.workflowId, request.cursor],
        )
      : undefined;
    if (request.cursor && !boundary) notFound('WorkflowExecution cursor');
    const page = await rows<WorkflowExecutionPage['items'][number]>(
      this.options.database,
      `SELECT ${workflowExecutionColumns} FROM workflow_executions WHERE project_id=$1 AND workflow_id=$2
       AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,
      [
        projectId,
        request.workflowId,
        boundary?.createdAt ?? null,
        boundary?.id ?? null,
        request.limit + 1,
      ],
    );
    const items = page.slice(0, request.limit);
    return { items, nextCursor: page.length > request.limit ? items.at(-1)!.id : null };
  }

  async launch(
    principal: Principal,
    projectId: string,
    request: { workflowId: string; input: WorkflowLaunch },
  ): Promise<WorkflowExecution> {
    return transaction(this.options.database, async (connection) => {
      const role = await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'runs:write',
      });
      requireScope(principal, 'jobs:write');
      const workflow = await findWorkflow(connection, {
        projectId,
        id: request.workflowId,
        lock: true,
      });
      const requestHash = createHash('sha256')
        .update(
          JSON.stringify({
            revision: request.input.revision,
            resumeFromExecutionId: request.input.resumeFromExecutionId ?? null,
          }),
        )
        .digest('hex');
      const existing = await first<{ id: string; requestHash: string }>(
        connection,
        'SELECT id,request_hash FROM workflow_executions WHERE workflow_id=$1 AND created_by=$2 AND idempotency_key=$3',
        [workflow.id, principal.user.id, request.input.idempotencyKey],
      );
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new DomainError(
            409,
            '同じ起動キーに異なる設定が指定されています',
            'workflow_launch_mismatch',
          );
        return findWorkflowExecution(connection, { projectId, id: existing.id });
      }
      const version = await findWorkflowVersion(connection, {
        projectId,
        workflowId: workflow.id,
        revision: request.input.revision,
      });
      const completed = request.input.resumeFromExecutionId
        ? await this.completedStepsForResume(connection, {
            caller: { role, userId: principal.user.id },
            projectId,
            version,
            executionId: request.input.resumeFromExecutionId,
          })
        : [];
      const execution = await insertWorkflowExecution(connection, {
        projectId,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        revision: version.revision,
        createdBy: principal.user.id,
        idempotencyKey: request.input.idempotencyKey,
        requestHash,
        resumeFromExecutionId: request.input.resumeFromExecutionId ?? null,
      });
      for (const [stepIndex, step] of version.steps.entries())
        await insertWorkflowStepExecution(connection, {
          executionId: execution.id,
          projectId,
          stepIndex,
          stepKey: step.key,
          name: step.name,
          reused: completed.find((previous) => previous.stepIndex === stepIndex) ?? null,
        });
      const summary = await findWorkflowExecutionSummary(connection, {
        projectId,
        id: execution.id,
        lock: true,
      });
      await this.options.executor.advance(connection, summary);
      return findWorkflowExecution(connection, { projectId, id: execution.id });
    });
  }

  async cancel(
    principal: Principal,
    projectId: string,
    executionId: string,
  ): Promise<WorkflowExecution> {
    return transaction(this.options.database, async (connection) => {
      const role = await requireProject(connection, principal, {
        projectId,
        role: 'editor',
        scope: 'jobs:write',
      });
      requireScope(principal, 'runs:write');
      const execution = await findWorkflowExecutionSummary(connection, {
        projectId,
        id: executionId,
        lock: true,
      });
      assertControlsWorkflowExecution({ role, userId: principal.user.id }, execution);
      if (execution.status !== 'running' && execution.status !== 'canceling')
        return findWorkflowExecution(connection, { projectId, id: execution.id });
      await connection.query("UPDATE workflow_executions SET status='canceling' WHERE id=$1", [
        execution.id,
      ]);
      const steps = await listWorkflowStepExecutions(connection, execution.id);
      await connection.query(
        "UPDATE workflow_step_runs SET status='canceled',ended_at=now() WHERE execution_id=$1 AND status='pending'",
        [execution.id],
      );
      const version = await findWorkflowVersion(connection, {
        projectId,
        workflowId: execution.workflowId,
        revision: execution.revision,
      });
      let active = false;
      for (const step of steps.filter(
        (step) => step.status === 'queued' || step.status === 'running',
      )) {
        const job = await this.options.jobs.requestCancelInTransaction(connection, {
          projectId,
          jobId: step.jobId!,
        });
        if (!isTerminalStatus(job.status)) {
          active = true;
          continue;
        }
        // The Job may have ended before the scheduler saw it, even successfully; its step keeps
        // what the Run did, so a resumed execution reuses a step that succeeded.
        await this.options.executor.recordRunState(connection, {
          step,
          definition: version.steps[step.stepIndex]!,
          run: await findRun(connection, { projectId, id: job.runId }),
        });
      }
      if (!active)
        await finishWorkflowExecution(connection, { id: execution.id, status: 'canceled' });
      return findWorkflowExecution(connection, { projectId, id: execution.id });
    });
  }

  /** The leading steps a resumed execution reuses; only those who may stop the source resume it. */
  private async completedStepsForResume(
    connection: Connection,
    request: {
      caller: { role: ProjectRole; userId: string };
      projectId: string;
      version: WorkflowVersion;
      executionId: string;
    },
  ): Promise<WorkflowStepExecution[]> {
    const source = await findWorkflowExecution(connection, {
      projectId: request.projectId,
      id: request.executionId,
    });
    assertControlsWorkflowExecution(request.caller, source);
    if (
      source.workflowVersionId !== request.version.id ||
      (source.status !== 'failed' && source.status !== 'canceled')
    )
      throw new DomainError(
        409,
        '同じバージョンの失敗・停止した実行から再開してください',
        'workflow_resume_invalid',
      );
    const completed: WorkflowStepExecution[] = [];
    for (const step of source.steps) {
      if (step.status !== 'finished') break;
      completed.push(step);
    }
    return completed;
  }
}
