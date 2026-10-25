import { rows, transaction, type Database } from '../db/database.js';
import { errorClue } from '../domain/errorClue.js';
import { WORKFLOW_STEP_LAUNCH_RETRY_DELAY_SECONDS } from '../domain/workflowStepLaunchRetry.js';
import { findWorkflowExecutionSummary } from '../repositories/workflowExecutionRepository.js';
import type { WorkflowExecutor } from './workflowExecutor.js';
import { PollingLoop } from './pollingLoop.js';

// 完了したstepは、画面で待たされたと感じさせずに次のstepへ出力を渡したい。
const WORKFLOW_POLL_INTERVAL_MS = 2000;
// 1回の巡回で進める実行の数。古い順に進め、1回を短く保つ。残りは2秒待つ。
const WORKFLOW_SCHEDULER_BATCH_SIZE = 50;

export class WorkflowScheduler {
  private readonly loop: PollingLoop;
  constructor(
    private readonly database: Database,
    private readonly executor: WorkflowExecutor,
  ) {
    this.loop = new PollingLoop({
      intervalMs: WORKFLOW_POLL_INTERVAL_MS,
      run: () => this.tick(),
      failureEvent: 'workflow_scheduler_failed',
    });
  }
  start(): void {
    this.loop.start();
  }
  async stop(): Promise<void> {
    await this.loop.stop();
  }

  /**
   * stepのRunが変わった実行と、始めるstepがある実行を1回巡回する。起動に失敗したstepは、
   * WORKFLOW_STEP_LAUNCH_RETRY_DELAY_SECONDS待ってから再び起動する。失敗した実行はログに
   * 残し、ほかの実行は止めない。
   */
  async tick(): Promise<number> {
    const candidates = await rows<{ id: string; projectId: string }>(
      this.database,
      `SELECT DISTINCT execution.id,execution.project_id,execution.created_at FROM workflow_executions execution
       JOIN workflow_step_runs step ON step.execution_id=execution.id
       LEFT JOIN runs run ON run.id=step.run_id
       WHERE execution.status IN ('running','canceling') AND (
         (step.status IN ('queued','running') AND run.status<>step.status)
         OR (step.status='pending' AND NOT EXISTS(SELECT 1 FROM workflow_step_runs active
           WHERE active.execution_id=execution.id AND active.status IN ('queued','running'))
           AND NOT EXISTS(SELECT 1 FROM workflow_step_runs waiting
             WHERE waiting.execution_id=execution.id AND waiting.status='pending'
             AND waiting.launch_failed_at>now()-make_interval(secs=>$2))))
       ORDER BY execution.created_at,execution.id LIMIT $1`,
      [WORKFLOW_SCHEDULER_BATCH_SIZE, WORKFLOW_STEP_LAUNCH_RETRY_DELAY_SECONDS],
    );
    let advanced = 0;
    for (const candidate of candidates) {
      try {
        await transaction(this.database, async (connection) => {
          // 複数のAPIプロセスが同じ完了を見ることがあるが、進めるのは1つだけ。
          const locked = await rows<{ id: string }>(
            connection,
            "SELECT id FROM workflow_executions WHERE id=$1 AND status IN ('running','canceling') FOR UPDATE SKIP LOCKED",
            [candidate.id],
          );
          if (!locked.length) return;
          const execution = await findWorkflowExecutionSummary(connection, {
            projectId: candidate.projectId,
            id: candidate.id,
          });
          await this.executor.advance(connection, execution);
          advanced += 1;
        });
      } catch (error) {
        // エラーの詳細にはSQL文が入ることがある。原因を探すには、実行のidとエラーの名前とコード
        // （SQLSTATE）があれば足りる。この巡回の結果は何も残らないので、次の巡回でその実行を
        // もう一度試す。
        console.error(
          JSON.stringify({
            event: 'workflow_advance_failed',
            executionId: candidate.id,
            ...errorClue(error),
          }),
        );
      }
    }
    return advanced;
  }
}
