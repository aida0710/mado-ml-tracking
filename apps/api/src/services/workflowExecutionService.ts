import { createHash } from 'node:crypto';
import type {
  WorkflowExecution,
  WorkflowExecutionPage,
  WorkflowLaunch,
  WorkflowStepExecution,
  WorkflowVersion,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, transaction, type Connection, type Database } from '../db/database.js';
import { DomainError, notFound } from '../domain/errors.js';
import { findWorkflow, findWorkflowVersion } from '../repositories/workflowDefinitionRepository.js';
import {
  findWorkflowExecution,
  findWorkflowExecutionSummary,
  finishWorkflowExecution,
  listWorkflowStepRuns,
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
      await requireProject(connection, principal, {
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
            projectId,
            version,
            executionId: request.input.resumeFromExecutionId,
          })
        : [];
      const execution = (await first<{ id: string }>(
        connection,
        `INSERT INTO workflow_executions(project_id,workflow_id,workflow_version_id,revision,created_by,idempotency_key,request_hash,resume_from_execution_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          projectId,
          workflow.id,
          version.id,
          version.revision,
          principal.user.id,
          request.input.idempotencyKey,
          requestHash,
          request.input.resumeFromExecutionId ?? null,
        ],
      ))!;
      for (const [stepIndex, step] of version.steps.entries()) {
        const reused = completed.find((previous) => previous.stepIndex === stepIndex);
        await connection.query(
          `INSERT INTO workflow_step_runs(execution_id,project_id,step_index,step_key,name,status,run_id,job_id,reused,dataset_usage,
          output_dataset_version_ids,output_model_version_ids,metrics,ended_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            execution.id,
            projectId,
            stepIndex,
            step.key,
            step.name,
            reused ? 'finished' : 'pending',
            reused?.runId ?? null,
            reused?.jobId ?? null,
            !!reused,
            JSON.stringify(reused?.datasetUsage ?? []),
            reused?.outputDatasetVersionIds ?? [],
            reused?.outputModelVersionIds ?? [],
            JSON.stringify(reused?.metrics ?? {}),
            reused?.endedAt ?? null,
          ],
        );
      }
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
      if (execution.createdBy !== principal.user.id && role !== 'admin')
        throw new DomainError(
          403,
          'ワークフローを停止できるのは実行した利用者と管理者です',
          'workflow_control_forbidden',
        );
      if (execution.status !== 'running' && execution.status !== 'canceling')
        return findWorkflowExecution(connection, { projectId, id: execution.id });
      await connection.query("UPDATE workflow_executions SET status='canceling' WHERE id=$1", [
        execution.id,
      ]);
      const steps = await listWorkflowStepRuns(connection, execution.id);
      await connection.query(
        "UPDATE workflow_step_runs SET status='canceled',ended_at=now() WHERE execution_id=$1 AND status='pending'",
        [execution.id],
      );
      let active = false;
      for (const step of steps.filter(
        (step) => step.status === 'queued' || step.status === 'running',
      )) {
        const job = await this.options.jobs.requestCancelInTransaction(connection, {
          projectId,
          jobId: step.jobId!,
        });
        if (job.status === 'queued' || job.status === 'claimed' || job.status === 'running')
          active = true;
        else
          await connection.query(
            "UPDATE workflow_step_runs SET status='canceled',ended_at=now() WHERE id=$1",
            [step.id],
          );
      }
      if (!active)
        await finishWorkflowExecution(connection, { id: execution.id, status: 'canceled' });
      return findWorkflowExecution(connection, { projectId, id: execution.id });
    });
  }

  private async completedStepsForResume(
    connection: Connection,
    request: { projectId: string; version: WorkflowVersion; executionId: string },
  ): Promise<WorkflowStepExecution[]> {
    const source = await findWorkflowExecution(connection, {
      projectId: request.projectId,
      id: request.executionId,
    });
    if (
      source.workflowVersionId !== request.version.id ||
      (source.status !== 'failed' && source.status !== 'canceled')
    )
      throw new DomainError(
        409,
        '同じバージョンの失敗・停止した実行から再処理してください',
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
