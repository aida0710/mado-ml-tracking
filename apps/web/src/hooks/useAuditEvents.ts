import { useState } from 'react';
import type { AuditEvent } from '@mmt/contracts';
import { auditApi, type AuditEventFilter } from '../api/audit';
import { useCursorPages, type CursorPagesState } from './useCursorPages';

/** Whose events to read: one Project's log, or the global log of global administrators. */
export type AuditEventScope = { projectId: string } | 'global';

export interface AuditEventsState extends CursorPagesState<AuditEvent> {
  filter: AuditEventFilter;
  setFilter: (filter: AuditEventFilter) => void;
}

// Sign-ins are written on every session and bury the changes people look for, so they start
// hidden; one click shows them.
const INITIAL_AUDIT_FILTER: AuditEventFilter = { hideSignIns: true };

// Pass null when the viewer may not read the log so no request is sent.
export function useAuditEvents(scope: AuditEventScope | null): AuditEventsState {
  const [filter, setFilter] = useState<AuditEventFilter>(INITIAL_AUDIT_FILTER);
  const projectId = scope !== null && scope !== 'global' ? scope.projectId : null;
  // A string key so a new scope object with the same Project does not refetch; a new filter
  // starts the list over.
  const scopeKey = scope === null ? null : projectId ?? 'global';
  const pages = useCursorPages(
    scopeKey === null ? null : `${scopeKey}:audit-events:${JSON.stringify(filter)}`,
    (cursor, signal) => {
      const request = { cursor, filter, signal };
      return projectId === null
        ? auditApi.globalEvents(request)
        : auditApi.projectEvents(projectId, request);
    },
  );
  return { ...pages, filter, setFilter };
}
