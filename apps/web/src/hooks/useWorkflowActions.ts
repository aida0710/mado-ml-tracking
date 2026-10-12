import { useState } from 'react';
import { workflowsApi } from '../api/workflows';
import { createWorkflowLaunchKeys, type WorkflowLaunchIntent } from '../lib/workflowLaunchKeys';

/**
 * Starting, resuming and stopping executions of one workflow. The calls throw, so the
 * confirmation that makes them shows the failure; a start sent again after a failed one reuses
 * its idempotency key, and only a start answered with an execution gives up its key
 * (lib/workflowLaunchKeys).
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
