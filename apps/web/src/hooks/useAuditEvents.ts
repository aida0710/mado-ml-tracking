import { useState } from 'react';
import type { AuditEvent } from '@mmt/contracts';
import { auditApi, type AuditEventFilter } from '../api/audit';
import { useCursorPages, type CursorPagesState } from './useCursorPages';

/** どのイベントを読むか。1つのProjectのログか、全体管理者が見る全体のログ。 */
export type AuditEventScope = { projectId: string } | 'global';

export interface AuditEventsState extends CursorPagesState<AuditEvent> {
  filter: AuditEventFilter;
  setFilter: (filter: AuditEventFilter) => void;
}

// ログインはセッションのたびに記録され、探したい変更を埋もれさせるので、最初は隠しておく。
// 1回のクリックで出せる。
const INITIAL_AUDIT_FILTER: AuditEventFilter = { hideSignIns: true };

// ログを見ている利用者に読む権限が無いときはnullを渡し、要求を送らないようにする。
export function useAuditEvents(scope: AuditEventScope | null): AuditEventsState {
  const [filter, setFilter] = useState<AuditEventFilter>(INITIAL_AUDIT_FILTER);
  const projectId = scope !== null && scope !== 'global' ? scope.projectId : null;
  // 文字列のキーにして、同じProjectの新しいscopeオブジェクトでは取得し直さない。絞り込みが
  // 変わったら一覧を最初からにする。
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
