import type { AuditEventsState } from '../hooks/useAuditEvents';
import { AuditEventsTable } from './AuditEventsTable';
import { AuditEventFilters } from './AuditEventFilters';
import { ErrorNotice, Loading } from './Feedback';

/**
 * ページ送りする監査ログ。絞り込みと、読み込み中・エラーの表示を含む。Projectの設定と全体管理
 * （`showProject`、全体のログ）で使う。
 */
export function AuditEventLog({
  audit,
  showProject = false,
}: {
  audit: AuditEventsState;
  showProject?: boolean;
}) {
  return (
    <>
      <AuditEventFilters
        filter={audit.filter}
        onChange={audit.setFilter}
        offersSignIns={showProject}
      />
      <ErrorNotice message={audit.error} retry={audit.reload} />
      {audit.loading && !audit.items.length ? (
        <Loading />
      ) : audit.error && !audit.items.length ? null : (
        <AuditEventsTable
          events={audit.items}
          hasMore={audit.hasMore}
          loading={audit.loading}
          onLoadMore={audit.loadMore}
          showProject={showProject}
        />
      )}
    </>
  );
}
