import { hooksApi } from '../api/hooks';
import { useCursorPages } from './useCursorPages';
import { useQuery } from './useQuery';

/** Projectのフック。新しい順。 */
export function useHookList(projectId: string) {
  return useQuery({ key: `${projectId}:hooks`, load: (signal) => hooksApi.list(projectId, signal) });
}

/**
 * 1つのフックの実行、またはhookIdが空ならすべてのフックの実行を、ページごとに読む。`enabled`が
 * falseの間（実行のタブを出していない）は何も要求しない。
 */
export function useHookExecutions(projectId: string, { hookId, enabled }: { hookId: string; enabled: boolean }) {
  return useCursorPages(
    enabled ? `${projectId}:hook-executions:${hookId}` : null,
    (cursor, signal) =>
      hooksApi.executions(projectId, { hookId: hookId || undefined, cursor }, signal),
  );
}
