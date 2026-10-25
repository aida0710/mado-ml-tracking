import { registryApi } from '../api/registry';
import { suggestModelFamilies } from '../lib/modelFamilyChoices';
import type { SuggestFieldValues } from '../types/form';
import { useQuery } from './useQuery';

/**
 * Projectのモデル系列と、系列の欄に渡す`suggest`。読み込むまでの間や読み込めないときは、欄は
 * 入力したどの系列も受け付ける。届いたら`refreshKey`が候補を出し直させる。
 */
export function useModelFamilies(projectId: string) {
  const families = useQuery({ key: `${projectId}:model-families`, load: (signal) =>
    registryApi.modelFamilies(projectId, signal),
  });
  const suggest: SuggestFieldValues = async (value) =>
    suggestModelFamilies(value, families.value ?? []);
  return {
    families: families.value ?? [],
    error: families.error,
    suggest,
    refreshKey: families.value?.length ?? -1,
  };
}
