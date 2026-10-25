import type { PromotionEvaluation } from '@mmt/contracts';
import { promotionApi } from '../api/promotion';
import { useCursorPages, type CursorPagesState } from './useCursorPages';
import { useMutation } from './useMutation';

export interface PromotionEvaluationsState extends CursorPagesState<PromotionEvaluation> {
  reevaluate: (evaluationId: string) => Promise<void>;
  reevaluating: boolean;
  reevaluateError: string | null;
}

// 1つの昇格policyの評価を、新しい順にページごとに読む。選んでいないときはpolicyIdにnullを渡す。
export function usePromotionEvaluations(
  projectId: string,
  policyId: string | null,
): PromotionEvaluationsState {
  const mutation = useMutation();
  // 昇格policyが無いとキーがnullになるので、読み込み関数は昇格policyがあるときだけ動く。
  const pages = useCursorPages(
    policyId === null ? null : `${projectId}:promotion-evaluations:${policyId}`,
    (cursor, signal) => promotionApi.evaluations(projectId, { policyId: policyId!, cursor, signal }),
  );
  // 再評価は新しい行を足すので、最初のページを取り直して一番上に出す。
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
