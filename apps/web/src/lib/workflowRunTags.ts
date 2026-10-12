// Tags the workflow executor puts on the Runs it creates (apps/api services/workflowExecutor.ts).
const WORKFLOW_ID_TAG = 'mmt.workflowId';
const WORKFLOW_EXECUTION_ID_TAG = 'mmt.workflowExecutionId';

type TaggedRun = { tags: Record<string, string> };

/** The workflow whose execution created the Run, or null for a Run started any other way. */
export function workflowIdOfRun(run: TaggedRun): string | null {
  return run.tags[WORKFLOW_ID_TAG] ?? null;
}

/** The workflow execution that created the Run, or null. */
export function workflowExecutionIdOfRun(run: TaggedRun): string | null {
  return run.tags[WORKFLOW_EXECUTION_ID_TAG] ?? null;
}
