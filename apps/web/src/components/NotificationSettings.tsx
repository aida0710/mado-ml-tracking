import { useNotificationSettings } from '../hooks/useNotificationSettings';
import { useProject } from '../hooks/useProject';
import { NotificationChannelSection } from './notifications/NotificationChannelSection';
import { NotificationRuleSection } from './notifications/NotificationRuleSection';
import { NotificationDeliverySection } from './notifications/NotificationDeliverySection';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 今のProjectの通知先、通知のルール、最近の配信。Project adminに表示する。通知先の編集は、APIと
 * 同じく全体管理者に限る。
 */
export function NotificationSettings() {
  useLocale();
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
