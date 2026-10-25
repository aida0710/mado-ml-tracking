import { useState } from 'react';
import { workflowsApi } from '../api/workflows';
import { createWorkflowLaunchKeys, type WorkflowLaunchIntent } from '../lib/workflowLaunchKeys';

/**
 * 1つのワークフローの実行の開始・再開・停止。呼び出しは失敗すると例外を投げるので、それを呼ぶ
 * 確認のダイアログが失敗を出す。失敗した開始をもう一度送るときは同じ冪等キーを使い、実行が
 * 返ってきた開始だけがキーを手放す（lib/workflowLaunchKeys）。
 */
export function useWorkflowActions(projectId: string, workflowId: string) {
  const [launchKeys] = useState(createWorkflowLaunchKeys);
  return {
    launch: async (intent: WorkflowLaunchIntent) => {
      const execution = await workflowsApi.launch(projectId, workflowId, {
        revision: intent.revision,
        idempotencyKey: launchKeys.keyFor(intent),
        ...(intent.resumeFromExecutionId
          ? { resumeFromExecutionId: intent.resumeFromExecutionId }
          : {}),
      });
      launchKeys.markAccepted(intent);
      return execution;
    },
    cancel: (executionId: string) => workflowsApi.cancel(projectId, executionId),
  };
}
