import type { ModelAliasEvent } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import { useCursorPages, type CursorPagesState } from './useCursorPages';

export type ModelAliasHistoryState = CursorPagesState<ModelAliasEvent>;

// 1つのモデルのaliasのイベントを、新しい順にページごとに読む。モデルを選んでいないときは
// modelIdにnullを渡す。
export function useModelAliasHistory(
  projectId: string,
  modelId: string | null,
): ModelAliasHistoryState {
  // モデルが無いとキーがnullになるので、読み込み関数はモデルがあるときだけ動く。
  return useCursorPages(
    modelId === null ? null : `${projectId}:alias-events:${modelId}`,
    (cursor, signal) => registryApi.aliasEvents(projectId, modelId!, { cursor, signal }),
  );
}
