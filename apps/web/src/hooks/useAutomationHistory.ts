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
  /** True until the first page has arrived. */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
}

/** Older pages read on demand, kept with the filter they belong to. */
interface LoadedPages {
  filterKey: string;
  items: ModelAutomationExecution[];
  nextCursor: string | null;
}

/**
 * The Project's automation executions, newest first, narrowed by rule and version. The newest page
 * is polled so running work stays current. Reading older pages stops the polling and keeps the
 * list as it was, so new rows cannot push rows out between the pages; reload and another filter
 * start over.
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
  // Changing the filter drops the older pages, so coming back to a filter shows its newest page
  // again, polled, not the list as it stood when it was left.
  const [shownFilterKey, setShownFilterKey] = useState(filterKey);
  if (shownFilterKey !== filterKey) {
    setShownFilterKey(filterKey);
    setLoaded(null);
    loadMoreFailure.clearFailure();
  }
  // A page that arrives after the filter changed still carries the filter it was read with.
  const pages = loaded?.filterKey === filterKey ? loaded : null;
  const newestPage = useQuery(
    enabled && !pages ? `${projectId}:automation-executions:${filterKey}` : null,
    (signal) =>
      automationApi.executionPage(
        projectId,
        { filter, limit: AUTOMATION_HISTORY_PAGE_SIZE },
        signal,
      ),
    EXECUTION_POLL_MS,
  );
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
