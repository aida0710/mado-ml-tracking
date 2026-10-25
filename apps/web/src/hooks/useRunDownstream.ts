import { registryApi } from '../api/registry';
import { useCursorPages } from './useCursorPages';

/** Runが始めたRun（子）。新しい順で、［さらに読み込む］付き。 */
export function useRunDownstream(projectId: string, runId: string) {
  return useCursorPages(`${projectId}:run:${runId}:downstream`, (cursor, signal) =>
    registryApi.runDownstream(projectId, runId, { cursor, signal }),
  );
}
