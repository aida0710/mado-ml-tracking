import { registryApi } from '../api/registry';
import { useQuery } from './useQuery';

/** The alias protections that apply to one Model: its own and the Project-wide ones. */
export function useModelAliasProtections(projectId: string, modelId: string | null) {
  return useQuery(modelId ? `${projectId}:alias-protections:${modelId}` : null, (signal) =>
    registryApi.aliasProtections(projectId, modelId, signal),
  );
}
