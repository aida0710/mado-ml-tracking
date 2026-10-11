import { useNotificationSettings } from '../hooks/useNotificationSettings';
import { useProject } from '../hooks/useProject';
import { NotificationChannelSection } from './notifications/NotificationChannelSection';
import { NotificationRuleSection } from './notifications/NotificationRuleSection';
import { NotificationDeliverySection } from './notifications/NotificationDeliverySection';
import { text } from '../i18n/catalog';

/**
 * Notification channels, rules and recent deliveries of the current Project. Shown to Project
 * admins; channel editing is limited to global administrators as in the API.
 */
export function NotificationSettings() {
  const { project, isProjectAdmin } = useProject();
  const settings = useNotificationSettings(isProjectAdmin ? project.id : null);
  if (!isProjectAdmin) return null;
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{text.notifications}</h2>
      </div>
      <p className="muted">{text.notificationsDescription}</p>
      <NotificationChannelSection settings={settings} projectId={project.id} />
      <NotificationRuleSection settings={settings} />
      <NotificationDeliverySection settings={settings} />
    </section>
  );
}
