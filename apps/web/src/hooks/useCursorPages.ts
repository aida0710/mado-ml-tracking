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
  /** これらのページがどのキーと読み直しの回数のものか。組が変わったら最初からにする。 */
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
 * キーに対して最初のページを読み、後のページは必要になったときに後ろへ足す。キーが変わると
 * 最初からにするので、キーには読み込み関数が使う絞り込みをすべて含める。nullを渡すと要求を送らない。
 */
export function useCursorPages<T>(
  key: string | null,
  loadPage: (cursor: string | undefined, signal: AbortSignal) => Promise<CursorPage<T>>,
): CursorPagesState<T> {
  const loaderRef = useLatestRef(loadPage);
  const { message: error, setFailure, clearFailure } = useFailureMessage();
  const [revision, setRevision] = useState(0);
  const [storedPages, setPages] = useState<LoadedPages<T>>(() => noPages(key, revision));
  // キーが変わるか読み直すと、このレンダリングの中で一覧を空にし、最初のページを読み込み中にする。
  const isStoredPagesCurrent = storedPages.key === key && storedPages.revision === revision;
  const pages = isStoredPagesCurrent ? storedPages : noPages<T>(key, revision);
  if (!isStoredPagesCurrent) {
    setPages(pages);
    clearFailure();
  }
  // キーが変わるか一覧を読み直したら、読み込み中のページを中止する。
  const controllerRef = useRef<AbortController | null>(null);

  // ページを読み込み中にするのは呼び出し側（最初のページはレンダリング中のリセット、次のページは
  // loadMore）。ここでは要求して応答を保存するだけ。
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
