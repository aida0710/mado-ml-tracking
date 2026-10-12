import { useState } from 'react';
import type { WorkflowVersion } from '@mmt/contracts';
import { workflowsApi } from '../api/workflows';
import { isActiveWorkflowExecution } from '../lib/workflowExecutionState';
import { useMutation } from './useMutation';
import { useQuery } from './useQuery';
import { useQueryPolledWhileActive } from './useQueryPolledWhileActive';

export function useWorkflowDetail(projectId: string, workflowId: string) {
  return useQuery(`workflow:${projectId}:${workflowId}`, (signal) =>
    workflowsApi.get(projectId, workflowId, signal),
  );
}

/**
 * The versions older than the ones the workflow came with, loaded a page at a time on request.
 * A new first cursor (the workflow was reloaded after a new version) starts over.
 */
export function useOlderWorkflowVersions(
  projectId: string,
  workflowId: string,
  firstCursor: string | null,
) {
  const mutation = useMutation();
  const startingOver = { firstCursor, versions: [] as WorkflowVersion[], nextCursor: firstCursor };
  const [loaded, setLoaded] = useState(startingOver);
  const current = loaded.firstCursor === firstCursor ? loaded : startingOver;
  const loadMore = () => {
    const cursor = current.nextCursor;
    if (!cursor) return;
    void mutation.run(async () => {
      const page = await workflowsApi.olderVersions(projectId, workflowId, cursor);
      setLoaded({
        firstCursor,
        versions: [...current.versions, ...page.items],
        nextCursor: page.nextCursor,
      });
    });
  };
  return {
    versions: current.versions,
    hasMore: current.nextCursor !== null,
    loadMore,
    pending: mutation.pending,
    error: mutation.error,
  };
}

/** One execution, polled only while it runs or waits for a stop. */
export function useWorkflowExecution(projectId: string, executionId: string) {
  return useQueryPolledWhileActive(
    executionId ? `workflow-execution:${projectId}:${executionId}` : null,
    (signal) => workflowsApi.execution(projectId, executionId, signal),
    isActiveWorkflowExecution,
  );
}

/** A page of the execution history, polled only while one of its executions is still moving. */
export function useWorkflowHistory(projectId: string, workflowId: string) {
  const [cursor, setCursor] = useState<string | undefined>();
  const query = useQueryPolledWhileActive(
    `workflow-history:${projectId}:${workflowId}:${cursor ?? ''}`,
    (signal) => workflowsApi.history(projectId, workflowId, { cursor, signal }),
    (page) => page.items.some(isActiveWorkflowExecution),
  );
  return { ...query, cursor, setCursor };
}
