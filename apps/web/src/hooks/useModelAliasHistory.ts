import type { ModelAliasEvent } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import { useCursorPages, type CursorPagesState } from './useCursorPages';

export type ModelAliasHistoryState = CursorPagesState<ModelAliasEvent>;

// Pages through one Model's alias events, newest first. Pass modelId null when no Model is selected.
export function useModelAliasHistory(
  projectId: string,
  modelId: string | null,
): ModelAliasHistoryState {
  // The key is null without a Model, so the loader only runs with one.
  return useCursorPages(
    modelId === null ? null : `${projectId}:alias-events:${modelId}`,
    (cursor, signal) => registryApi.aliasEvents(projectId, modelId!, { cursor, signal }),
  );
}
