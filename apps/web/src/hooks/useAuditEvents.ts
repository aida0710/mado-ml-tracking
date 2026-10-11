import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuditEvent } from '@mmt/contracts';
import { auditApi, type AuditEventFilter } from '../api/audit';
import { useFailureMessage } from './useFailureMessage';

/** Whose events to read: one Project's log, or the global log of global administrators. */
export type AuditEventScope = { projectId: string } | 'global';

export interface AuditEventsState {
  items: AuditEvent[];
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  filter: AuditEventFilter;
  setFilter: (filter: AuditEventFilter) => void;
  loadMore: () => void;
  reload: () => void;
}

// Sign-ins are written on every session and bury the changes people look for, so they start
// hidden; one click shows them.
const INITIAL_AUDIT_FILTER: AuditEventFilter = { hideSignIns: true };

// Pass null when the viewer may not read the log so no request is sent.
export function useAuditEvents(scope: AuditEventScope | null): AuditEventsState {
  // A string key so a new scope object with the same Project does not refetch.
  const scopeKey = scope === null ? null : scope === 'global' ? 'global' : scope.projectId;
  const [filter, setFilter] = useState<AuditEventFilter>(INITIAL_AUDIT_FILTER);
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { message: error, setFailure, clearFailure } = useFailureMessage();
  const [revision, setRevision] = useState(0);
  // Aborts the in-flight page when the scope changes or the list is reloaded.
  const controllerRef = useRef<AbortController | null>(null);

  const loadPage = useCallback(
    async (cursor: string | undefined) => {
      if (scopeKey === null) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);
      clearFailure();
      try {
        const request = { cursor, filter, signal: controller.signal };
        const page =
          scopeKey === 'global'
            ? await auditApi.globalEvents(request)
            : await auditApi.projectEvents(scopeKey, request);
        if (controller.signal.aborted) return;
        setItems((previous) => (cursor ? [...previous, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (failure) {
        if (!controller.signal.aborted) setFailure(failure);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [scopeKey, filter, clearFailure, setFailure],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void loadPage(undefined);
    return () => controllerRef.current?.abort();
  }, [loadPage, revision]);

  return {
    items,
    hasMore: nextCursor !== null,
    loading,
    error,
    filter,
    setFilter,
    loadMore: () => {
      if (nextCursor && !loading) void loadPage(nextCursor);
    },
    reload: () => setRevision((value) => value + 1),
  };
}
