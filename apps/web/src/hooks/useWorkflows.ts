import { useState } from 'react';
import type { WorkflowVersion } from '@mmt/contracts';
import { workflowsApi } from '../api/workflows';
import { isActiveWorkflowExecution } from '../lib/workflowExecutionState';
import { useMutation } from './useMutation';
import { useQuery } from './useQuery';
import { useQueryPolledWhileActive } from './useQueryPolledWhileActive';

export function useWorkflowDetail(projectId: string, workflowId: string) {
  return useQuery({ key: `workflow:${projectId}:${workflowId}`, load: (signal) =>
    workflowsApi.get(projectId, workflowId, signal),
  });
}

/**
 * ワークフローに付いてきたバージョンより古いバージョン。求められたときに1ページずつ読み込む。
 * 最初のカーソルが新しくなる（新しいバージョンの後でワークフローを読み直した）と、最初からにする。
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

/** 1つの実行。実行中か停止を待っている間だけポーリングする。 */
export function useWorkflowExecution(projectId: string, executionId: string) {
  return useQueryPolledWhileActive(
    executionId ? `workflow-execution:${projectId}:${executionId}` : null,
    (signal) => workflowsApi.execution(projectId, executionId, signal),
    isActiveWorkflowExecution,
  );
}

/** 実行の履歴の1ページ。その中の実行がまだ動いている間だけポーリングする。 */
export function useWorkflowHistory(projectId: string, workflowId: string) {
  const [cursor, setCursor] = useState<string | undefined>();
  const query = useQueryPolledWhileActive(
    `workflow-history:${projectId}:${workflowId}:${cursor ?? ''}`,
    (signal) => workflowsApi.history(projectId, workflowId, { cursor, signal }),
    (page) => page.items.some(isActiveWorkflowExecution),
  );
  return { ...query, cursor, setCursor };
}
