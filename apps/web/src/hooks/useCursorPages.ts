import { useCallback, useEffect, useRef, useState } from 'react';
import { useFailureMessage } from './useFailureMessage';
import { useLatestRef } from './useLatestRef';

export interface CursorPage<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface CursorPagesState<T> {
  items: T[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  reload: () => void;
}

interface LoadedPages<T> {
  /** The key and reload count these pages belong to; a new pair starts over. */
  key: string | null;
  revision: number;
  items: T[];
  nextCursor: string | null;
  loading: boolean;
}

function noPages<T>(key: string | null, revision: number): LoadedPages<T> {
  return { key, revision, items: [], nextCursor: null, loading: key !== null };
}

/**
 * Reads the first page for a key and appends later pages on demand. A new key starts over, so
 * the key must cover every filter the loader uses. Pass null to send no request.
 */
export function useCursorPages<T>(
  key: string | null,
  loadPage: (cursor: string | undefined, signal: AbortSignal) => Promise<CursorPage<T>>,
): CursorPagesState<T> {
  const loaderRef = useLatestRef(loadPage);
  const { message: error, setFailure, clearFailure } = useFailureMessage();
  const [revision, setRevision] = useState(0);
  const [storedPages, setPages] = useState<LoadedPages<T>>(() => noPages(key, revision));
  // A new key or a reload empties the list in this very render and marks its first page as loading.
  const isStoredPagesCurrent = storedPages.key === key && storedPages.revision === revision;
  const pages = isStoredPagesCurrent ? storedPages : noPages<T>(key, revision);
  if (!isStoredPagesCurrent) {
    setPages(pages);
    clearFailure();
  }
  // Aborts the in-flight page when the key changes or the list is reloaded.
  const controllerRef = useRef<AbortController | null>(null);

  // Callers mark the page as loading first: the render-time reset for the first page, loadMore
  // for the next ones. This only requests it and stores the answer.
  const load = useCallback(async (cursor: string | undefined) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const page = await loaderRef.current(cursor, controller.signal);
      if (controller.signal.aborted) return;
      setPages((previous) => ({
        ...previous,
        items: cursor ? [...previous.items, ...page.items] : page.items,
        nextCursor: page.nextCursor ?? null,
      }));
    } catch (failure) {
      if (!controller.signal.aborted) setFailure(failure);
    } finally {
      if (!controller.signal.aborted) setPages((previous) => ({ ...previous, loading: false }));
    }
  }, [loaderRef, setFailure]);

  useEffect(() => {
    if (!key) return;
    void load(undefined);
    return () => controllerRef.current?.abort();
  }, [key, load, revision]);

  return {
    items: pages.items,
    hasMore: pages.nextCursor !== null,
    loading: pages.loading,
    error: isStoredPagesCurrent ? error : null,
    loadMore: () => {
      if (!pages.nextCursor || pages.loading) return;
      setPages((previous) => ({ ...previous, loading: true }));
      clearFailure();
      void load(pages.nextCursor);
    },
    reload: () => setRevision((value) => value + 1),
  };
}
