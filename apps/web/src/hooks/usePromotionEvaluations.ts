import type { PromotionEvaluation } from '@mmt/contracts';
import { promotionApi } from '../api/promotion';
import { useCursorPages, type CursorPagesState } from './useCursorPages';
import { useMutation } from './useMutation';

export interface PromotionEvaluationsState extends CursorPagesState<PromotionEvaluation> {
  reevaluate: (evaluationId: string) => Promise<void>;
  reevaluating: boolean;
  reevaluateError: string | null;
}

// Pages through one policy's evaluations, newest first. Pass policyId null when none is selected.
export function usePromotionEvaluations(
  projectId: string,
  policyId: string | null,
): PromotionEvaluationsState {
  const mutation = useMutation();
  // The key is null without a policy, so the loader only runs with one.
  const pages = useCursorPages(
    policyId === null ? null : `${projectId}:promotion-evaluations:${policyId}`,
    (cursor, signal) => promotionApi.evaluations(projectId, { policyId: policyId!, cursor, signal }),
  );
  // A re-evaluation appends a new row, so the first page is fetched again to show it on top.
  async function reevaluate(evaluationId: string) {
    const created = await mutation.run(() => promotionApi.reevaluate(projectId, evaluationId));
    if (created) pages.reload();
  }
  return {
    ...pages,
    reevaluate,
    reevaluating: mutation.pending,
    reevaluateError: mutation.error,
  };
}
