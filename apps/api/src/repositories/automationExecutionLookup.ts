import { MAX_JOB_ATTEMPTS, type ModelAutomationExecution } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';

export type AutomationExecutionRecord = Pick<
  ModelAutomationExecution,
  | 'id'
  | 'projectId'
  | 'ruleId'
  | 'modelVersionId'
  | 'runId'
  | 'jobId'
  | 'status'
  | 'triggerRunId'
  | 'pipelineRootExecutionId'
  | 'attempt'
  | 'source'
>;

/**
 * Runを作った自動実行の実行記録を探す。手動のJobの再試行で作ったRunには自分の実行記録が無いので、
 * jobs.retry_of_job_idをたどって元のJobのRunまで戻る。人が作ったRunにはnullを返す。Runのタグは
 * 見ない。予約タグを強制する前の古いRunには、利用者がautomation.*タグを書いていた可能性がある。
 */
export async function findExecutionForRun(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<AutomationExecutionRecord | null> {
  let runId: string | null = reference.runId;
  // 再試行の連なりのJobはMAX_JOB_ATTEMPTS個までなので、これで最初の試行に届く。この上限は、
  // 壊れた連なりで無限に回ることも防ぐ。
  for (let step = 0; runId !== null && step <= MAX_JOB_ATTEMPTS; step += 1) {
    const execution = await first<AutomationExecutionRecord>(
      connection,
      `SELECT id,project_id,rule_id,model_version_id,run_id,job_id,status,trigger_run_id,
        pipeline_root_execution_id,attempt,source
      FROM model_automation_executions WHERE project_id=$1 AND run_id=$2`,
      [reference.projectId, runId],
    );
    if (execution) return execution;
    runId = await findRetriedRunId(connection, { projectId: reference.projectId, runId });
  }
  return null;
}

// 渡したRunのJobが再試行した元のJobのRun。再試行で作られたRunでなければnull。
async function findRetriedRunId(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<string | null> {
  const original = await first<{ runId: string }>(
    connection,
    `SELECT original.run_id FROM jobs retried
    JOIN jobs original ON original.id=retried.retry_of_job_id AND original.project_id=retried.project_id
    WHERE retried.project_id=$1 AND retried.run_id=$2`,
    [reference.projectId, reference.runId],
  );
  return original?.runId ?? null;
}
