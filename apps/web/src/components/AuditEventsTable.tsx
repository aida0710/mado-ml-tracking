import type { AuditEvent } from '@mmt/contracts';
import { ResponsiveTable } from './ResponsiveTable';
import { summarizeAuditDetails } from '../lib/auditEventSummary';
import { auditActionLabel, auditActorLabel, auditProjectLabel } from '../lib/auditEventDisplay';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { accessText } from '../i18n/access';

const outcomeLabels: Record<AuditEvent['outcome'], string> = {
  get success() { return accessText.auditOutcomeSuccess; },
  get denied() { return accessText.auditOutcomeDenied; },
  get failure() { return accessText.auditOutcomeFailure; },
};

/** 監査ログの記録を新しい順に並べる。全体のログでは`showProject`でProjectの列を足す。 */
export function AuditEventsTable({
  events,
  hasMore,
  loading,
  onLoadMore,
  showProject = false,
}: {
  events: AuditEvent[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  showProject?: boolean;
}) {
  useLocale();
  return (
    <>
      <ResponsiveTable
        rows={events}
        rowKey={(event) => event.id}
        empty={accessText.auditEmpty}
        columns={[
          {
            key: 'occurredAt',
            priority: 'primary',
            header: accessText.auditOccurredAt,
            render: (event) => formatDate(event.occurredAt),
          },
          ...(showProject
            ? [
                {
                  key: 'project',
                  priority: 'secondary' as const,
                  header: accessText.auditProject,
                  className: 'audit-label',
                  render: (event: AuditEvent) => auditProjectLabel(event),
                },
              ]
            : []),
          {
            key: 'actor',
            priority: 'primary',
            header: accessText.auditActor,
            className: 'audit-label',
            render: (event) => (
              <span title={event.actorUserId ?? undefined}>{auditActorLabel(event)}</span>
            ),
          },
          {
            key: 'action',
            priority: 'primary',
            header: accessText.auditAction,
            className: 'audit-label',
            // 拒否と失敗は操作の横に印を付ける。スマートフォンでは結果の列が開いた行の中へ移るので、
            // こうすれば閉じた行にも出る。
            render: (event) => (
              <span title={event.action}>
                {auditActionLabel(event.action)}
                {event.outcome !== 'success' && (
                  <span className="audit-outcome-tag">{outcomeLabels[event.outcome]}</span>
                )}
              </span>
            ),
          },
          {
            key: 'outcome',
            priority: 'secondary',
            header: accessText.auditOutcome,
            className: 'audit-label',
            render: (event) => outcomeLabels[event.outcome],
          },
          {
            key: 'resource',
            priority: 'secondary',
            header: accessText.auditResource,
            className: 'mono',
            render: (event) =>
              event.resourceId ? `${event.resourceType}/${event.resourceId}` : event.resourceType,
          },
          {
            key: 'details',
            priority: 'secondary',
            header: accessText.auditDetails,
            render: (event) => (
              <span title={JSON.stringify(event.details)}>
                {summarizeAuditDetails(event.details)}
              </span>
            ),
          },
        ]}
      />
      {hasMore && (
        <div className="section-actions">
          <button className="button small" disabled={loading} onClick={onLoadMore}>
            {accessText.auditLoadMore}
          </button>
        </div>
      )}
    </>
  );
}
