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
import { errorClue } from '../domain/errorClue.js';
import { DomainError } from '../domain/errors.js';
import { workflowParentRunId } from '../domain/workflowLineage.js';
import { finiteWorkflowMetrics, workflowQualityFailure } from '../domain/workflowQuality.js';
import {
  isTemporaryLaunchFailure,
  launchFailureMessage,
  WORKFLOW_STEP_LAUNCH_MAX_FAILURES,
} from '../domain/workflowStepLaunchRetry.js';
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
  recordWorkflowStepLaunchFailure,
} from '../repositories/workflowExecutionRepository.js';
import { requireProject } from './accessService.js';
import type { TaskService } from './taskService.js';
import { resolveWorkflowInputs } from './workflowInputs.js';

const LAUNCH_SAVEPOINT = 'workflow_step_launch';

/**
 * ロックした実行を1つ進める。永続化した状態をポーリングするので、APIを再起動しても
 * その間の完了を拾える。
 */
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
   * stepのRunを今の状態のまま記録する。状態、メトリクス、出力を残し、品質ゲートか出力モデルを
   * 満たさずに終わったときは失敗にする。Runが終わったかどうかを返す。
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
    // レポートから消えたメトリクスや、入力が0件で定まらない比率が、古いレポートの値のまま
    // 残らないようにする。
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
      await this.recordLaunchFailure(connection, {
        execution: request.execution,
        step: request.pending,
        error,
      });
    }
  }

  /**
   * 続けても通らない拒否は、stepとその実行をすぐに失敗にする。通るかもしれない失敗はstepを
   * 保留のままにし、待ってからスケジューラがもう一度起動する。起動の失敗が
   * WORKFLOW_STEP_LAUNCH_MAX_FAILURES回続くまでそうする。回数はこのトランザクションでstepと
   * 一緒に保存するので、再起動しても、別のAPIプロセスでも引き継がれる。
   */
  private async recordLaunchFailure(
    connection: Connection,
    failure: { execution: WorkflowExecutionSummary; step: WorkflowStepExecution; error: unknown },
  ): Promise<void> {
    const { execution, step, error } = failure;
    const failures = await recordWorkflowStepLaunchFailure(connection, step.id);
    const retrying =
      isTemporaryLaunchFailure(error) && failures < WORKFLOW_STEP_LAUNCH_MAX_FAILURES;
    // エラーの詳細にはSQL文が入ることがある。原因を探すには、実行、step、エラーの名前とコード
    // （SQLSTATE）があれば足りる。
    console.error(
      JSON.stringify({
        event: 'workflow_step_launch_failed',
        executionId: execution.id,
        stepKey: step.stepKey,
        code: error instanceof DomainError ? error.code : 'internal_error',
        ...errorClue(error),
        failures,
        retrying,
      }),
    );
    if (retrying) return;
    const message = launchFailureMessage({ error, failures });
    await connection.query(
      "UPDATE workflow_step_runs SET status='failed',error=$2,ended_at=now() WHERE id=$1",
      [step.id, message],
    );
    await finishWorkflowExecution(connection, {
      id: execution.id,
      status: 'failed',
      error: message,
    });
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
      throw new DomainError({
        status: 403,
        code: 'workflow_owner_unavailable',
        message: 'the permission of the user who ran it is no longer valid',
      });
    const principal: Principal = { user, method: 'session', token: null };
    await requireProject(connection, principal, {
      projectId: execution.projectId,
      role: 'editor',
      scope: 'runs:write',
    });
    return principal;
  }
}
