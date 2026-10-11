import type { Model } from '@mmt/contracts';
import { promotionApi } from '../api/promotion';
import { registryApi } from '../api/registry';
import { collectKnownAliases, suggestAliasNames } from '../lib/aliasChoices';
import type { SuggestFieldValues } from '../types/form';
import { useQuery } from './useQuery';

/**
 * A `suggest` for an alias field: the names already used for `modelId` (null: any Model) by the
 * Models' aliases, promotion policies and protections. Until they load, or if they cannot, the
 * field takes any typed name; `refreshKey` offers them once they arrive.
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
  const policies = useQuery(`${projectId}:promotion-policies`, (signal) =>
    promotionApi.policies(projectId, signal),
  );
  // Without a Model the API lists the Project-wide protections only.
  const protections = useQuery(`${projectId}:alias-protections:${modelId ?? ''}`, (signal) =>
    registryApi.aliasProtections(projectId, modelId, signal),
  );
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
