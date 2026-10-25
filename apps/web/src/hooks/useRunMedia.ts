import type { RunMediaKeySummary } from '@mmt/contracts';
import { runMediaApi, type RunMediaOfKey } from '../api/runMedia';
import { useQuery, type QueryState } from './useQuery';

/**
 * Runが記録したメディアのキーと、選んだキーのすべての項目（stepの順）。選んだキーは、利用者が
 * 選んだもの、選ぶまでは最初のキー。
 */
export function useRunMedia({
  projectId,
  runId,
  chosenKey,
}: {
  projectId: string;
  runId: string;
  chosenKey: string | null;
}): {
  keys: QueryState<RunMediaKeySummary[]>;
  selectedKey: string | null;
  items: QueryState<RunMediaOfKey>;
} {
  const keys = useQuery({ key: `${projectId}:run-media-keys:${runId}`, load: (signal) => runMediaApi.keys(projectId, runId, signal) });
  const selectedKey = chosenKey ?? keys.value?.[0]?.key ?? null;
  const items = useQuery({ key: selectedKey === null ? null : `${projectId}:run-media:${runId}:${selectedKey}`, load: (signal) =>
    runMediaApi.list(projectId, runId, { key: selectedKey! }, signal),
  });
  return { keys, selectedKey, items };
}
