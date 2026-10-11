import { registryApi } from '../api/registry';
import { suggestModelFamilies } from '../lib/modelFamilyChoices';
import type { SuggestFieldValues } from '../types/form';
import { useQuery } from './useQuery';

/**
 * The Project's model families and a `suggest` for a family field. Until they load, or if they
 * cannot, the field takes any typed family; `refreshKey` offers them once they arrive.
 */
export function useModelFamilies(projectId: string) {
  const families = useQuery(`${projectId}:model-families`, (signal) =>
    registryApi.modelFamilies(projectId, signal),
  );
  const suggest: SuggestFieldValues = async (value) =>
    suggestModelFamilies(value, families.value ?? []);
  return {
    families: families.value ?? [],
    error: families.error,
    suggest,
    refreshKey: families.value?.length ?? -1,
  };
}
