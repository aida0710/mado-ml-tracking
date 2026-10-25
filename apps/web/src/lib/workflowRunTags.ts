// ワークフローの実行の処理がRunを作るときに付けるタグ（apps/apiのservices/workflowExecutor.ts）。
const WORKFLOW_ID_TAG = 'mmt.workflowId';
const WORKFLOW_EXECUTION_ID_TAG = 'mmt.workflowExecutionId';

type TaggedRun = { tags: Record<string, string> };

/** そのRunを作った実行のワークフロー。ほかの方法で始めたRunならnull。 */
export function workflowIdOfRun(run: TaggedRun): string | null {
  return run.tags[WORKFLOW_ID_TAG] ?? null;
}

/** そのRunを作ったワークフローの実行。無ければnull。 */
export function workflowExecutionIdOfRun(run: TaggedRun): string | null {
  return run.tags[WORKFLOW_EXECUTION_ID_TAG] ?? null;
}
