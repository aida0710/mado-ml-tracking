import type { AuditEventsState } from '../hooks/useAuditEvents';
import { AuditEventsTable } from './AuditEventsTable';
import { AuditEventFilters } from './AuditEventFilters';
import { ErrorNotice, Loading } from './Feedback';

/**
 * A paged audit log with its filters and its loading and error states, for the Project settings
 * and 全体管理 (`showProject`, the global log).
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
