import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { OPERATIONS_ALERT_MAX_PAGE_SIZE } from '@mmt/contracts';
import { administrationApi } from '../api/administration';
import { useOperationsAlerts } from '../hooks/useOperationsAlerts';
import { usePopover } from '../hooks/usePopover';
import { useQuery } from '../hooks/useQuery';
import { describeOperationsAlertSubject } from '../lib/operationsAlertSubject';
import { orderAlertsForProject } from '../lib/operationsAlertOrder';
import { formatDate } from '../lib/format';
import { useLocale } from '../i18n/useLocale';
import { operationsAlertKindLabels } from '../i18n/operations';
import { text, textTemplates } from '../i18n/catalog';

function bellLabel(count: number, mayHaveMore: boolean): string {
  if (!count) return text.operationsAlerts;
  return mayHaveMore
    ? textTemplates.operationsAlertCountAtLeast(count)
    : textTemplates.operationsAlertCount(count);
}

/**
 * The header bell: open operations alerts of every Project the user is a member of, on Project
 * screens and in 全体設定 alike, listed with their Project in a popover on click. The open
 * Project's alerts come first.
 */
export function OperationsAlertBadge({ openProjectId }: { openProjectId?: string }) {
  useLocale();
  const alerts = useOperationsAlerts();
  const popoverId = useId();
  const { container, isOpen, toggle } = usePopover();
  // Names are looked up only once the list is shown; the count needs none.
  const projects = useQuery(
    isOpen ? 'operations-alert-projects' : null,
    administrationApi.projects,
  );
  const projectName = (projectId: string) =>
    projects.value?.find((project) => project.id === projectId)?.name ??
    text.operationsAlertUnknownProject;
  const items = orderAlertsForProject(alerts.value ?? [], openProjectId);
  // One request returns at most this many, so a full list means more may be open.
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
                        {operationsAlertKindLabels[alert.kind]}
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
