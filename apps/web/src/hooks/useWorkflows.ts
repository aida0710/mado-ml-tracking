import { useRef, useState } from 'react';
import { workflowsApi } from '../api/workflows';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';
import { useMutation } from './useMutation';

export function useWorkflowDetail(projectId: string, workflowId: string) {
  return useQuery(`workflow:${projectId}:${workflowId}`, (signal) =>
    workflowsApi.get(projectId, workflowId, signal),
  );
}

export function useWorkflowExecution(projectId: string, executionId: string) {
  return useQuery(
    executionId ? `workflow-execution:${projectId}:${executionId}` : null,
    (signal) => workflowsApi.execution(projectId, executionId, signal),
    EXECUTION_POLL_MS,
  );
}

export function useWorkflowHistory(projectId: string, workflowId: string) {
  const [cursor, setCursor] = useState<string | undefined>();
  const query = useQuery(
    `workflow-history:${projectId}:${workflowId}:${cursor ?? ''}`,
    (signal) => workflowsApi.history(projectId, workflowId, { cursor, signal }),
    EXECUTION_POLL_MS,
  );
  return { ...query, cursor, setCursor };
}

export function useWorkflowActions(
  projectId: string,
  workflowId: string,
  onStarted: (executionId: string) => void,
) {
  const mutation = useMutation();
  // A transport failure may have happened after acceptance; the next click repeats the same request.
  const launchIntent = useRef<{ intent: string; key: string } | null>(null);
  const start = async (revision: number, resumeFromExecutionId?: string) =>
    mutation.run(async () => {
      const intent = `${revision}:${resumeFromExecutionId ?? ''}`;
      if (launchIntent.current?.intent !== intent)
        launchIntent.current = { intent, key: crypto.randomUUID() };
      const execution = await workflowsApi.launch(projectId, workflowId, {
        revision,
        idempotencyKey: launchIntent.current.key,
        ...(resumeFromExecutionId ? { resumeFromExecutionId } : {}),
      });
      launchIntent.current = null;
      onStarted(execution.id);
      return execution;
    });
  return {
    ...mutation,
    start,
    cancel: (executionId: string) =>
      mutation.run(() => workflowsApi.cancel(projectId, executionId)),
  };
}
