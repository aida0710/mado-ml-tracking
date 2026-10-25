// ワークフローの画面のアドレス。ワークフローは最新の実行を出し、`?execution=`でほかの実行を出す。

export const WORKFLOW_EXECUTION_PARAM = 'execution';

/** ワークフローの画面。`executionId`を渡すと、その実行を開いた状態にする。 */
export function workflowPath(
  projectId: string,
  { workflowId, executionId }: { workflowId: string; executionId?: string | null },
): string {
  const path = `/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}`;
  if (!executionId) return path;
  return `${path}?${new URLSearchParams({ [WORKFLOW_EXECUTION_PARAM]: executionId })}`;
}
