import type {
  WorkflowExecution,
  WorkflowExecutionSummary,
  WorkflowStepExecution,
} from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

export const workflowExecutionColumns =
  'id,project_id,workflow_id,workflow_version_id,revision,status,created_by,created_at,ended_at,error,resume_from_execution_id';

export async function findWorkflowExecutionSummary(
  connection: Connection,
  reference: { projectId: string; id: string; lock?: boolean },
): Promise<WorkflowExecutionSummary> {
  const execution = await first<WorkflowExecutionSummary>(
    connection,
    `SELECT ${workflowExecutionColumns} FROM workflow_executions WHERE project_id=$1 AND id=$2 ${reference.lock ? 'FOR UPDATE' : ''}`,
    [reference.projectId, reference.id],
  );
  if (!execution) notFound('WorkflowExecution');
  return execution;
}

export async function listWorkflowStepRuns(
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

export async function findWorkflowExecution(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<WorkflowExecution> {
  const execution = await findWorkflowExecutionSummary(connection, reference);
  return { ...execution, steps: await listWorkflowStepRuns(connection, execution.id) };
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
