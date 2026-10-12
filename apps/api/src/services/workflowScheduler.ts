import { rows, transaction, type Database } from '../db/database.js';
import { findWorkflowExecutionSummary } from '../repositories/workflowExecutionRepository.js';
import type { WorkflowExecutor } from './workflowExecutor.js';
import { PollingLoop } from './pollingLoop.js';

// A completed step should hand its output to the next without a noticeable wait in the UI.
const WORKFLOW_POLL_INTERVAL_MS = 2000;
// Executions advanced per pass, oldest first, so one pass stays short; the rest wait two seconds.
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
   * One pass over the executions whose step Runs changed or that have a step to start. A failing
   * execution is logged and does not stop the others.
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
           WHERE active.execution_id=execution.id AND active.status IN ('queued','running'))))
       ORDER BY execution.created_at,execution.id LIMIT $1`,
      [WORKFLOW_SCHEDULER_BATCH_SIZE],
    );
    let advanced = 0;
    for (const candidate of candidates) {
      try {
        await transaction(this.database, async (connection) => {
          // Multiple API processes may observe the same completion, but only one advances it.
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
      } catch {
        // Error details can include SQL text; the execution id is enough to find it. Nothing of
        // the pass was kept, so the next pass tries the execution again.
        console.error(
          JSON.stringify({ event: 'workflow_advance_failed', executionId: candidate.id }),
        );
      }
    }
    return advanced;
  }
}
