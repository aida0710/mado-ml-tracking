import type { NotificationDelivery } from '@mmt/contracts';
import type { NotificationSettingsState } from '../../hooks/useNotificationSettings';
import { formatDate } from '../../lib/format';
import { describeNotificationError } from '../../lib/notificationErrorText';
import { ResponsiveTable } from '../ResponsiveTable';
import { Resource } from '../Feedback';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';
import { notificationDeliveryStatusLabels } from '../../i18n/notifications';

/** The Project's recent notification deliveries, with the reason of each failure. */
export function NotificationDeliverySection({
  settings,
}: {
  settings: NotificationSettingsState;
}) {
  useLocale();
  return (
    <>
      <div className="section-heading">
        <h3>{text.notificationDeliveries}</h3>
        <button className="button small" onClick={settings.deliveries.reload}>
          {text.refresh}
        </button>
      </div>
      <Resource query={settings.deliveries}>
        {(deliveries) => (
          <ResponsiveTable<NotificationDelivery>
            rows={deliveries}
            rowKey={(delivery) => delivery.id}
            empty={text.notificationDeliveriesEmpty}
            columns={[
              {
                key: 'createdAt',
                priority: 'primary',
                header: text.notificationDeliveryCreatedAt,
                render: (delivery) => formatDate(delivery.createdAt),
              },
              {
                key: 'event',
                priority: 'primary',
                header: text.notificationDeliveryEvent,
                render: (delivery) => delivery.title,
              },
              {
                key: 'channel',
                priority: 'secondary',
                header: text.notificationRuleChannel,
                render: (delivery) => delivery.channelName,
              },
              {
                key: 'status',
                priority: 'primary',
                header: text.status,
                render: (delivery) => notificationDeliveryStatusLabels[delivery.status],
              },
              {
                key: 'attempts',
                priority: 'secondary',
                header: text.notificationDeliveryAttempts,
                render: (delivery) => delivery.attempts,
              },
              {
                key: 'error',
                priority: 'secondary',
                header: text.notificationDeliveryError,
                render: (delivery) =>
                  delivery.lastError ? describeNotificationError(delivery.lastError) : '',
              },
            ]}
          />
        )}
      </Resource>
    </>
  );
}
