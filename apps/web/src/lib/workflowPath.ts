// The workflow page's address: the workflow shows its newest execution, `?execution=` another one.

export const WORKFLOW_EXECUTION_PARAM = 'execution';

/** The page of a workflow, opened on one of its executions when `executionId` is given. */
export function workflowPath(
  projectId: string,
  { workflowId, executionId }: { workflowId: string; executionId?: string | null },
): string {
  const path = `/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}`;
  if (!executionId) return path;
  return `${path}?${new URLSearchParams({ [WORKFLOW_EXECUTION_PARAM]: executionId })}`;
}
