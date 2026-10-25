import { useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { OPERATIONS_ALERT_MAX_PAGE_SIZE } from '@mmt/contracts';
import { usePopover } from '@mado/design-system/react';
import { administrationApi } from '../api/administration';
import { useOperationsAlerts } from '../hooks/useOperationsAlerts';
import { useQuery } from '../hooks/useQuery';
import { describeOperationsAlertSubject } from '../lib/operationsAlertSubject';
import { orderAlertsForProject } from '../lib/operationsAlertOrder';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { notificationEventTypeLabels } from '../i18n/notifications';
import { text, textTemplates } from '../i18n/catalog';

function bellLabel(count: number, mayHaveMore: boolean): string {
  if (!count) return text.operationsAlerts;
  return mayHaveMore
    ? textTemplates.operationsAlertCountAtLeast(count)
    : textTemplates.operationsAlertCount(count);
}

/**
 * 上部バーのベル。利用者がメンバーであるすべてのProjectの、開いている運用アラートを、Projectの画面
 * でも全体設定でも同じように示し、クリックでポップオーバーにProjectと一緒に並べる。開いている
 * Projectのアラートを先に並べる。
 */
export function OperationsAlertBadge({ openProjectId }: { openProjectId?: string }) {
  useLocale();
  const alerts = useOperationsAlerts();
  const popoverId = useId();
  const { pathname } = useLocation();
  const { container, isOpen, toggle } = usePopover({ closeKey: pathname });
  // 名前は一覧を表示してから引く。件数だけなら名前は要らない。
  const projects = useQuery({
    key: isOpen ? 'operations-alert-projects' : null,
    load: administrationApi.projects,
  });
  const projectName = (projectId: string) =>
    projects.value?.find((project) => project.id === projectId)?.name ??
    text.operationsAlertUnknownProject;
  const items = orderAlertsForProject(alerts.value ?? [], openProjectId);
  // 1回の要求で返るのはこの数までなので、満杯ならほかにも開いているものがありうる。
  const mayHaveMore = items.length >= OPERATIONS_ALERT_MAX_PAGE_SIZE;
  const countBadge = mayHaveMore
    ? textTemplates.operationsAlertBadgeAtLeast(items.length)
    : String(items.length);
  const label = bellLabel(items.length, mayHaveMore);

  return (
    <div className="operations-alerts" ref={container}>
      <button
        type="button"
        className={`icon-button operations-alert-button${items.length ? ' has-alerts' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        onClick={toggle}
      >
        <Bell size={17} />
        {items.length > 0 && <span className="operations-alert-count">{countBadge}</span>}
      </button>
      {isOpen && (
        <div className="operations-alert-popover" id={popoverId} role="dialog" aria-label={label}>
          <div className="operations-alert-heading">
            <strong>{text.operationsAlerts}</strong>
            <span className="muted">{text.operationsAlertsScope}</span>
          </div>
          {alerts.error && <p className="notice error">{text.operationsAlertsLoadFailed}</p>}
          {!alerts.error && items.length === 0 && (
            <p className="muted operations-alert-empty">
              {alerts.loading ? text.loading : text.operationsAlertsNone}
            </p>
          )}
          {items.length > 0 && (
            <ul>
              {items.map((alert) => {
                const subject = describeOperationsAlertSubject(alert);
                return (
                  <li key={alert.id}>
                    <Link
                      to={`/projects/${encodeURIComponent(alert.projectId)}/${subject.pagePath}`}
                    >
                      <span className="operations-alert-project">
                        {projectName(alert.projectId)}
                      </span>
                      <span className="operations-alert-kind">
                        {/* アラートの種類は、それが積む通知のイベントでもあり、両方の画面で同じ名前で呼ぶ。 */}
                        {notificationEventTypeLabels[alert.kind]}
                      </span>
                      <span className="operations-alert-subject">{subject.label}</span>
                      <span className="muted operations-alert-time">
                        {text.operationsAlertOpenedAt}: {formatDate(alert.openedAt)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
