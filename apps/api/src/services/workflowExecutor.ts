import type {
  Run,
  User,
  WorkflowExecutionSummary,
  WorkflowStep,
  WorkflowStepExecution,
} from '@mmt/contracts';
import { PREPROCESSING_METRIC_PREFIX } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { workflowParentRunId } from '../domain/workflowLineage.js';
import { finiteWorkflowMetrics, workflowQualityFailure } from '../domain/workflowQuality.js';
import { preprocessingMetrics } from '../domain/preprocessingMetrics.js';
import {
  findPreprocessingReport,
  findPreprocessingMetricNames,
} from '../repositories/preprocessingReportRepository.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import { findRun } from '../repositories/registryRepository.js';
import { findWorkflowVersion } from '../repositories/workflowDefinitionRepository.js';
import {
  finishWorkflowExecution,
  listWorkflowStepExecutions,
} from '../repositories/workflowExecutionRepository.js';
import { requireProject } from './accessService.js';
import type { TaskService } from './taskService.js';
import { resolveWorkflowInputs } from './workflowInputs.js';

const LAUNCH_SAVEPOINT = 'workflow_step_launch';

/** Advances one locked execution; durable polling also recovers completions across API restarts. */
export class WorkflowExecutor {
  constructor(private readonly tasks: TaskService) {}

  async advance(connection: Connection, execution: WorkflowExecutionSummary): Promise<void> {
    const version = await findWorkflowVersion(connection, {
      projectId: execution.projectId,
      workflowId: execution.workflowId,
      revision: execution.revision,
    });
    let steps = await listWorkflowStepExecutions(connection, execution.id);
    const active = steps.find((step) => step.status === 'queued' || step.status === 'running');
    if (active?.runId) {
      const run = await findRun(connection, { projectId: execution.projectId, id: active.runId });
      const finished = await this.recordRunState(connection, {
        step: active,
        definition: version.steps[active.stepIndex]!,
        run,
      });
      if (!finished) return;
      steps = await listWorkflowStepExecutions(connection, execution.id);
    }
    if (execution.status === 'canceling') {
      await finishWorkflowExecution(connection, { id: execution.id, status: 'canceled' });
      return;
    }
    const unsuccessful = steps.find(
      (step) => step.status === 'failed' || step.status === 'canceled',
    );
    if (unsuccessful) {
      await finishWorkflowExecution(connection, {
        id: execution.id,
        status: unsuccessful.status === 'canceled' ? 'canceled' : 'failed',
        error: unsuccessful.error ?? undefined,
      });
      return;
    }
    const pending = steps.find((step) => step.status === 'pending');
    if (!pending) {
      await finishWorkflowExecution(connection, { id: execution.id, status: 'finished' });
      return;
    }
    await this.launchStep(connection, {
      execution,
      definition: version.steps[pending.stepIndex]!,
      pending,
      completed: steps.filter((step) => step.status === 'finished'),
    });
  }

  /**
   * Records the step's Run as it is now: its status, metrics and outputs, failed when it finished
   * short of its quality gates or output model. Returns whether the Run has ended.
   */
  async recordRunState(
    connection: Connection,
    request: { step: WorkflowStepExecution; definition: WorkflowStep; run: Run },
  ): Promise<boolean> {
    const { run, step, definition } = request;
    const terminal = isTerminalStatus(run.status);
    const report = await findPreprocessingReport(connection, {
      projectId: run.projectId,
      runId: run.id,
    });
    const reportMetricNames = new Set(
      report
        ? await findPreprocessingMetricNames(connection, {
            projectId: run.projectId,
            runId: run.id,
          })
        : [],
    );
    // Removed report metrics and an undefined zero-input ratio must not survive older reports.
    const runMetrics = report
      ? Object.fromEntries(
          Object.entries(run.latestMetrics).filter(
            ([name]) =>
              !name.startsWith(PREPROCESSING_METRIC_PREFIX) && !reportMetricNames.has(name),
          ),
        )
      : run.latestMetrics;
    const metrics = {
      ...finiteWorkflowMetrics(runMetrics),
      ...(report ? preprocessingMetrics(report) : {}),
    };
    const qualityError =
      run.status === 'finished' ? workflowQualityFailure(definition.qualityGates, metrics) : null;
    const registrationError =
      run.status === 'finished' && definition.task.outputModel && !run.outputModelVersionIds.length
        ? '出力モデルの登録に失敗しました'
        : null;
    const error = qualityError ?? registrationError ?? run.error;
    const status = run.status === 'finished' && error ? 'failed' : run.status;
    await connection.query(
      `UPDATE workflow_step_runs SET status=$2,metrics=$3,output_dataset_version_ids=$4,
      output_model_version_ids=$5,error=$6,ended_at=$7 WHERE id=$1`,
      [
        step.id,
        status,
        JSON.stringify(metrics),
        run.outputDatasetVersionIds,
        run.outputModelVersionIds,
        error,
        terminal ? (run.endedAt ?? new Date().toISOString()) : null,
      ],
    );
    return terminal;
  }

  private async launchStep(
    connection: Connection,
    request: {
      execution: WorkflowExecutionSummary;
      definition: WorkflowStep;
      pending: WorkflowStepExecution;
      completed: WorkflowStepExecution[];
    },
  ): Promise<void> {
    await connection.query(`SAVEPOINT ${LAUNCH_SAVEPOINT}`);
    try {
      const { execution, definition, pending, completed } = request;
      const principal = await this.executionPrincipal(connection, execution);
      const inputs = await resolveWorkflowInputs(connection, {
        projectId: execution.projectId,
        step: definition,
        completed,
      });
      const launched = await this.tasks.launchTaskInTransaction(connection, {
        task: definition.task,
        input: {
          executionMode: 'run',
          name: definition.name,
          inputDatasetVersionIds: [...new Set(inputs.usage.map((input) => input.datasetVersionId))],
          modelVersionId: inputs.modelVersionId,
        },
        createdBy: principal.user.id,
        serverTags: {
          'mmt.workflowId': execution.workflowId,
          'mmt.workflowExecutionId': execution.id,
          'mmt.workflowStepKey': definition.key,
        },
        lineage: {
          parentRunId: workflowParentRunId(definition, completed),
          upstreamDatasetVersionIds: inputs.upstreamDatasetVersionIds,
        },
        environment: {
          datasetUsage: inputs.usage.map(({ datasetVersionId, role, weight, selection }) => ({
            datasetVersionId,
            role,
            weight,
            selection,
          })),
          workflow: {
            executionId: execution.id,
            workflowId: execution.workflowId,
            workflowVersionId: execution.workflowVersionId,
            revision: execution.revision,
            stepKey: definition.key,
          },
        },
      });
      await connection.query(
        `UPDATE workflow_step_runs SET run_id=$2,job_id=$3,status='queued',dataset_usage=$4 WHERE id=$1`,
        [pending.id, launched.run.id, launched.job.id, JSON.stringify(inputs.usage)],
      );
      await connection.query(`RELEASE SAVEPOINT ${LAUNCH_SAVEPOINT}`);
    } catch (error) {
      await connection.query(`ROLLBACK TO SAVEPOINT ${LAUNCH_SAVEPOINT}`);
      await connection.query(`RELEASE SAVEPOINT ${LAUNCH_SAVEPOINT}`);
      const refused = error instanceof DomainError;
      // Error details can include SQL text; the execution and step are enough to find it.
      console.error(
        JSON.stringify({
          event: 'workflow_step_launch_failed',
          executionId: request.execution.id,
          stepKey: request.definition.key,
          code: refused ? error.code : 'internal_error',
        }),
      );
      // Anything but a refusal (a lost database connection, say) may pass, so the step stays
      // pending and the next scheduler pass launches it, even hours into an execution.
      if (!refused) throw error;
      await connection.query(
        "UPDATE workflow_step_runs SET status='failed',error=$2,ended_at=now() WHERE id=$1",
        [request.pending.id, error.message],
      );
      await finishWorkflowExecution(connection, {
        id: request.execution.id,
        status: 'failed',
        error: error.message,
      });
    }
  }

  private async executionPrincipal(
    connection: Connection,
    execution: WorkflowExecutionSummary,
  ): Promise<Principal> {
    const user = await first<User>(
      connection,
      "SELECT * FROM users WHERE id=$1 AND status='active'",
      [execution.createdBy],
    );
    if (!user)
      throw new DomainError(
        403,
        '実行した利用者の権限が無効になっています',
        'workflow_owner_unavailable',
      );
    const principal: Principal = { user, method: 'session', token: null };
    await requireProject(connection, principal, {
      projectId: execution.projectId,
      role: 'editor',
      scope: 'runs:write',
    });
    return principal;
  }
}
