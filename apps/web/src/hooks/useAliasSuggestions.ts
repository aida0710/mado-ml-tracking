import type { Model } from '@mmt/contracts';
import { promotionApi } from '../api/promotion';
import { registryApi } from '../api/registry';
import { collectKnownAliases, suggestAliasNames } from '../lib/aliasChoices';
import type { SuggestFieldValues } from '../types/form';
import { useQuery } from './useQuery';

/**
 * aliasの欄に渡す`suggest`。`modelId`（null: どのモデルでも）について、モデルのalias・昇格policy・
 * aliasの保護で既に使われている名前を出す。読み込むまでの間や読み込めないときは、欄は入力した
 * どの名前も受け付ける。届いたら`refreshKey`が候補を出し直させる。
 */
export function useAliasSuggestions({
  projectId,
  models,
  modelId,
}: {
  projectId: string;
  models: readonly Model[];
  modelId: string | null;
}) {
  const policies = useQuery({ key: `${projectId}:promotion-policies`, load: (signal) =>
    promotionApi.policies(projectId, signal),
  });
  // モデルを指定しないと、APIはProject全体のaliasの保護だけを返す。
  const protections = useQuery({ key: `${projectId}:alias-protections:${modelId ?? ''}`, load: (signal) =>
    registryApi.aliasProtections(projectId, modelId, signal),
  });
  const known = collectKnownAliases({
    models,
    modelId,
    policies: policies.value ?? [],
    protections: protections.value ?? [],
  });
  const suggest: SuggestFieldValues = async (value) => suggestAliasNames(value, known);
  return {
    suggest,
    refreshKey: [...known.keys()].join('\n'),
    error: policies.error ?? protections.error,
  };
}
