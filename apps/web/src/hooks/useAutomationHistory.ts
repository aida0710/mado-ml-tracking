import { useState } from 'react';
import type { ModelAutomationExecution } from '@mmt/contracts';
import {
  AUTOMATION_HISTORY_PAGE_SIZE,
  automationApi,
  type AutomationExecutionFilter,
} from '../api/automation';
import { EXECUTION_POLL_MS, useQuery } from './useQuery';
import { useFailureMessage } from './useFailureMessage';

export interface AutomationHistoryState {
  items: ModelAutomationExecution[];
  /** 最初のページが届くまでtrue。 */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
}

/** 必要になったときに読んだ古いページ。どの絞り込みのものかと一緒に持つ。 */
interface LoadedPages {
  filterKey: string;
  items: ModelAutomationExecution[];
  nextCursor: string | null;
}

/**
 * Projectの自動実行履歴を新しい順に並べ、ルールとバージョンで絞り込んだもの。最新のページは
 * ポーリングして、実行中のものを最新に保つ。古いページを読むとポーリングを止めて一覧をそのまま
 * 保ち、ページの間に新しい行が入って行を押し出さないようにする。読み直しや別の絞り込みでは
 * 最初からにする。
 */
export function useAutomationHistory({
  projectId,
  filter,
  enabled,
}: {
  projectId: string;
  filter: AutomationExecutionFilter;
  enabled: boolean;
}): AutomationHistoryState {
  const filterKey = `${filter.ruleId ?? ''}:${filter.modelVersionId ?? ''}`;
  const [loaded, setLoaded] = useState<LoadedPages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreFailure = useFailureMessage();
  // 絞り込みを変えると古いページは捨てるので、元の絞り込みに戻ると、離れたときの一覧ではなく、
  // ポーリングしている最新のページをまた出す。
  const [shownFilterKey, setShownFilterKey] = useState(filterKey);
  if (shownFilterKey !== filterKey) {
    setShownFilterKey(filterKey);
    setLoaded(null);
    loadMoreFailure.clearFailure();
  }
  // 絞り込みが変わった後に届いたページにも、読んだときの絞り込みが付いている。
  const pages = loaded?.filterKey === filterKey ? loaded : null;
  const newestPage = useQuery({
    key: enabled && !pages ? `${projectId}:automation-executions:${filterKey}` : null,
    load: (signal) =>
      automationApi.executionPage(
        projectId,
        { filter, limit: AUTOMATION_HISTORY_PAGE_SIZE },
        signal,
      ),
    pollMs: EXECUTION_POLL_MS,
  });
  const items = pages?.items ?? newestPage.value?.items ?? [];
  const nextCursor = pages ? pages.nextCursor : (newestPage.value?.nextCursor ?? null);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    loadMoreFailure.clearFailure();
    try {
      const page = await automationApi.executionPage(projectId, {
        filter,
        limit: AUTOMATION_HISTORY_PAGE_SIZE,
        cursor: nextCursor,
      });
      setLoaded({ filterKey, items: [...items, ...page.items], nextCursor: page.nextCursor });
    } catch (failure) {
      loadMoreFailure.setFailure(failure);
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    items,
    loading: !pages && newestPage.loading && !newestPage.value,
    loadingMore,
    hasMore: nextCursor !== null,
    error: loadMoreFailure.message ?? (pages ? null : newestPage.error),
    loadMore: () => void loadMore(),
    reload: () => {
      setLoaded(null);
      loadMoreFailure.clearFailure();
      newestPage.reload();
    },
  };
}
