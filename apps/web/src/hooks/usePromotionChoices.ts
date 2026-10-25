import { promotionApi } from '../api/promotion';
import { useModelAliasProtections } from './useModelAliasProtections';
import { useQuery } from './useQuery';

/**
 * 1つのモデルのバージョンの昇格を判定するのに要るもの。モデルの昇格policy（それぞれがどのaliasを
 * 対象にするか）、モデルに効くaliasの保護、バージョンについての判定。
 */
export function usePromotionChoices(projectId: string, modelId: string, versionId: string) {
  const policies = useQuery({ key: `${projectId}:promotion-policies:${modelId}`, load: async (signal) =>
    (await promotionApi.policies(projectId, signal)).filter((policy) => policy.modelId === modelId),
  });
  const protections = useModelAliasProtections(projectId, modelId);
  // 最新のページで足りる。バージョンの判定は、昇格policyと評価のRunごとに1つしかない。
  const decisions = useQuery({
    key: versionId ? `${projectId}:promotion-evaluations:${versionId}` : null,
    load: async (signal) =>
      (await promotionApi.evaluations(projectId, { candidateVersionId: versionId, signal })).items,
  });
  return {
    policies,
    protections,
    decisions,
    reload: () => {
      policies.reload();
      protections.reload();
      decisions.reload();
    },
  };
}
