import type { RunSearchPage, RunSearchRequest } from '@mmt/contracts';
import { isApiError, type ApiError } from '@mado/design-system/http';
import { trackingApi } from '../api/tracking';
import { formatErrorMessage } from '../lib/errorMessage';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

// APIが実行できない絞り込み（対応していない項目や比較）に返す応答。
const FILTER_REJECTED_STATUS = 400;
const FILTER_REJECTED_CODE = 'invalid_request';

type RunSearchOutcome = { page: RunSearchPage } | { rejection: ApiError };

/**
 * サーバー側でのRunの検索の1ページ。Runが実行中の間は更新する。APIが断った絞り込みは、`runs`の
 * エラーではなく`filterRejection`として返す。検索し直しても直らないので、再試行のボタンと一緒に
 * ではなく、絞り込みを入力する場所に出す。
 */
export function useRunSearch(
  projectId: string,
  search: RunSearchRequest,
): { runs: QueryState<RunSearchPage>; filterRejection: string | null } {
  const outcome = useQuery<RunSearchOutcome>({
    key: `${projectId}:run-search:${JSON.stringify(search)}`,
    load: async (signal) => {
      try {
        return { page: await trackingApi.searchRuns(projectId, search, signal) };
      } catch (failure) {
        if (
          isApiError(failure) &&
          failure.status === FILTER_REJECTED_STATUS &&
          failure.code === FILTER_REJECTED_CODE
        )
          return { rejection: failure };
        throw failure;
      }
    },
    pollMs: EXECUTION_POLL_MS,
  });
  const result = outcome.value;
  return {
    runs: { ...outcome, value: result && 'page' in result ? result.page : undefined },
    // 届いたときではなく、レンダリングのたびに文にする（useQueryは表示言語に従う）。
    filterRejection: result && 'rejection' in result ? formatErrorMessage(result.rejection) : null,
  };
}
