-- A step whose launch failed in a way that may pass (a lost database connection, a registry that
-- did not answer) stays pending and is launched again. The count and the time of the last failure
-- live with the step, so every API process and every restart sees the same count: the scheduler
-- waits between attempts and the execution fails once the count reaches its limit
-- (WorkflowExecutor, domain/workflowStepLaunchRetry.ts).
ALTER TABLE workflow_step_runs
  ADD COLUMN launch_failures integer NOT NULL DEFAULT 0 CHECK (launch_failures >= 0),
  ADD COLUMN launch_failed_at timestamptz;
