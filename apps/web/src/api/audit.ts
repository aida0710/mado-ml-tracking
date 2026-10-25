import type { AuditEvent, AuditEventPage } from '@mmt/contracts';
import { invalidResponseError, projectPath, request } from './http';

// 続きを読むたびにサーバーの1ページを取るよう、APIの既定値に合わせる。
export const AUDIT_EVENT_PAGE_SIZE = 50;

/** ログの絞り込み条件。APIが絞り込むので、ページ送りも絞り込んだログの中で進む。 */
export interface AuditEventFilter {
  outcome?: AuditEvent['outcome'];
  /** ログイン・ログアウトと、IdPとの同期を除く。 */
  hideSignIns?: boolean;
}

export interface AuditPageRequest {
  cursor?: string;
  filter?: AuditEventFilter;
  signal?: AbortSignal;
}

async function fetchAuditPage(
  path: string,
  { cursor, filter = {}, signal }: AuditPageRequest,
): Promise<AuditEventPage> {
  const query = new URLSearchParams({ limit: String(AUDIT_EVENT_PAGE_SIZE) });
  if (filter.outcome) query.set('outcome', filter.outcome);
  if (filter.hideSignIns) query.set('hideSignIns', 'true');
  if (cursor) query.set('cursor', cursor);
  const page = await request<AuditEventPage>(`${path}?${query}`, { signal });
  if (
    !Array.isArray(page.items) ||
    (page.nextCursor !== null && typeof page.nextCursor !== 'string')
  )
    throw invalidResponseError();
  return page;
}

export const auditApi = {
  projectEvents: (projectId: string, page: AuditPageRequest = {}) =>
    fetchAuditPage(`${projectPath(projectId)}/audit-events`, page),
  // 全体管理者だけ。どのProjectにも属さない記録（ログイン、ユーザー、保存先）も含む。
  globalEvents: (page: AuditPageRequest = {}) => fetchAuditPage('/audit-events', page),
};
