import { registryApi } from '../api/registry';
import { useQuery } from './useQuery';

/** 1つのモデルに効くaliasの保護。そのモデル自身のものと、Project全体のもの。 */
export function useModelAliasProtections(projectId: string, modelId: string | null) {
  return useQuery({ key: modelId ? `${projectId}:alias-protections:${modelId}` : null, load: (signal) =>
    registryApi.aliasProtections(projectId, modelId, signal),
  });
}
