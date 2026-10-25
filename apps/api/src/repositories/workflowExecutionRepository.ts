import type {
  DatasetUsage,
  WorkflowExecution,
  WorkflowExecutionSummary,
  WorkflowStepExecution,
} from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

// WorkflowStepExecutionはworkflow_step_runsの行として保存する。実行のステップごとに1行で、
// そのステップを実行したRunとJob（再利用したときは前の実行のRunとJob）を指す。

export const workflowExecutionColumns =
  'id,project_id,workflow_id,workflow_version_id,revision,status,created_by,created_at,ended_at,error,resume_from_execution_id';

export async function insertWorkflowExecution(
  connection: Connection,
  execution: {
    projectId: string;
    workflowId: string;
    workflowVersionId: string;
    revision: number;
    createdBy: string;
    idempotencyKey: string;
    requestHash: string;
    resumeFromExecutionId: string | null;
  },
): Promise<{ id: string }> {
  return (await first<{ id: string }>(
    connection,
    `INSERT INTO workflow_executions(project_id,workflow_id,workflow_version_id,revision,created_by,
      idempotency_key,request_hash,resume_from_execution_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      execution.projectId,
      execution.workflowId,
      execution.workflowVersionId,
      execution.revision,
      execution.createdBy,
      execution.idempotencyKey,
      execution.requestHash,
      execution.resumeFromExecutionId,
    ],
  ))!;
}

/**
 * 新しいステップはpendingで待つ。前の実行から再開したステップは、その実行のRun、Job、入力、
 * 出力を持ったfinished（再利用）として始まる。
 */
export async function insertWorkflowStepExecution(
  connection: Connection,
  step: {
    executionId: string;
    projectId: string;
    stepIndex: number;
    stepKey: string;
    name: string;
    reused: WorkflowStepExecution | null;
  },
): Promise<void> {
  const { reused } = step;
  await connection.query(
    `INSERT INTO workflow_step_runs(execution_id,project_id,step_index,step_key,name,status,
      run_id,job_id,reused,dataset_usage,output_dataset_version_ids,output_model_version_ids,
      metrics,ended_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      step.executionId,
      step.projectId,
      step.stepIndex,
      step.stepKey,
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

/** pendingのステップの起動失敗を数え、そのステップの起動が何回失敗したかを返す。 */
export async function recordWorkflowStepLaunchFailure(
  connection: Connection,
  stepId: string,
): Promise<number> {
  const counted = await first<{ launchFailures: number }>(
    connection,
    `UPDATE workflow_step_runs SET launch_failures=launch_failures+1,launch_failed_at=now()
    WHERE id=$1 RETURNING launch_failures`,
    [stepId],
  );
  return counted!.launchFailures;
}

export async function findWorkflowExecutionSummary(
  connection: Connection,
  reference: { projectId: string; id: string; lock?: boolean },
): Promise<WorkflowExecutionSummary> {
  const execution = await first<WorkflowExecutionSummary>(
    connection,
    `SELECT ${workflowExecutionColumns} FROM workflow_executions WHERE project_id=$1 AND id=$2 ${reference.lock ? 'FOR UPDATE' : ''}`,
    [reference.projectId, reference.id],
  );
  if (!execution) notFound('workflow execution');
  return execution;
}

export async function listWorkflowStepExecutions(
  connection: Connection,
  executionId: string,
): Promise<WorkflowStepExecution[]> {
  return rows(
    connection,
    `SELECT step.id,step.step_index,step.step_key,step.name,step.status,step.run_id,step.job_id,step.reused,
     step.dataset_usage,step.output_dataset_version_ids,step.output_model_version_ids,step.metrics,step.error,step.ended_at,
     CASE WHEN report.run_id IS NULL THEN NULL ELSE report.summary || jsonb_build_object(
       'runId',report.run_id,'projectId',report.project_id,'revision',report.revision,'updatedAt',report.updated_at)
     END AS preprocessing_report
     FROM workflow_step_runs step LEFT JOIN preprocessing_reports report ON report.run_id=step.run_id
     WHERE step.execution_id=$1 ORDER BY step.step_index`,
    [executionId],
  );
}

/**
 * ワークフローがRunを始めたステップ。ワークフローが始めたRunでなければnull。そのRunを再利用した
 * 後の実行のステップは、Runの起点とはみなさない。
 */
export async function findOriginStepExecutionOfRun(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<{ id: string; executionId: string; datasetUsage: DatasetUsage[] } | null> {
  return (
    (await first<{ id: string; executionId: string; datasetUsage: DatasetUsage[] }>(
      connection,
      `SELECT id,execution_id,dataset_usage FROM workflow_step_runs
      WHERE project_id=$1 AND run_id=$2 AND NOT reused`,
      [reference.projectId, reference.runId],
    )) ?? null
  );
}

export async function findWorkflowExecution(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<WorkflowExecution> {
  const execution = await findWorkflowExecutionSummary(connection, reference);
  return { ...execution, steps: await listWorkflowStepExecutions(connection, execution.id) };
}

export async function finishWorkflowExecution(
  connection: Connection,
  completion: { id: string; status: 'finished' | 'failed' | 'canceled'; error?: string },
): Promise<void> {
  await connection.query(
    'UPDATE workflow_executions SET status=$2,error=$3,ended_at=now() WHERE id=$1',
    [completion.id, completion.status, completion.error ?? null],
  );
}
