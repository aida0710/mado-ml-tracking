import type { ModelVersionDetail } from '@mmt/contracts';
import { promotionApi } from '../api/promotion';
import { registryApi } from '../api/registry';
import { hasActiveRun } from '../lib/automationActivity';
import { useCursorPages } from './useCursorPages';
import { useQuery } from './useQuery';
import { useQueryPolledWhileActive } from './useQueryPolledWhileActive';

/**
 * バージョンを使ったRun、それと比べる基準バージョンの評価、バージョンについて行われた昇格の判定。
 * バージョンを読み込むまでdetailはundefinedを渡す。baselineVersionIdは、ページで選んだ
 * 基準バージョン（useEvaluationBaseline）。
 */
export function useModelVersionEvaluations(
  projectId: string,
  detail: ModelVersionDetail | undefined,
  baselineVersionId: string | null,
) {
  const versionId = detail?.version.id ?? null;
  const results = useQueryPolledWhileActive(
    versionId ? `${projectId}:model-version:${versionId}:evaluations` : null,
    (signal) => registryApi.modelVersionEvaluations(projectId, versionId!, { signal }),
    (page) => hasActiveRun(page.items),
  );
  // バージョンをそれ自身と比べても、出す差が無い。
  const comparedVersionId = baselineVersionId !== versionId ? baselineVersionId : null;
  const baselineResults = useQuery({
    key: comparedVersionId ? `${projectId}:model-version:${comparedVersionId}:evaluations` : null,
    load: (signal) =>
      registryApi.modelVersionEvaluations(projectId, comparedVersionId!, {
        kind: 'evaluation',
        signal,
      }),
  });
  const promotionEvaluations = useCursorPages(
    versionId ? `${projectId}:promotion-evaluations:candidate:${versionId}` : null,
    (cursor, signal) =>
      promotionApi.evaluations(projectId, { candidateVersionId: versionId!, cursor, signal }),
  );
  return {
    results,
    baseline: { versionId: comparedVersionId, results: baselineResults },
    promotionEvaluations,
  };
}
