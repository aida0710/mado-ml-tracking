import { formatEnglishCount } from '../formatEnglishCount';

// 上部バーの運用アラートのバッジと、プラグインへのイベントの送信状況。
export const operationsText = {
  operationsAlerts: 'Operations alerts',
  operationsAlertsNone: 'No open operations alerts',
  operationsAlertsLoadFailed: 'Could not load operations alerts',
  operationsAlertOpenedAt: 'Detected',
  operationsAlertsScope:
    'Alerts for projects you are a member of (all projects for global administrators).',
  operationsAlertUnknownProject: '(Loading project)',
  pluginOutbox: 'Event delivery status',
  pluginOutboxPending: 'Undelivered',
  pluginOutboxSending: 'Sending',
  pluginOutboxOldestPending: 'Oldest undelivered event',
  pluginOutboxMaxAttempts: 'Highest attempt count',
  pluginOutboxLastError: 'Last error',
  pluginOutboxLastDelivered: 'Last delivery',
  pluginOutboxStalled:
    'Delivery is backlogged (undelivered for 15 minutes or more, or failed at least five times). Check the integration, then press “Resend event” after recovery.',
} as const;

export const operationsTextTemplates = {
  operationsAlertCount: (count: number) => formatEnglishCount(count, 'operations alert'),
  operationsAlertCountAtLeast: (count: number) =>
    `At least ${formatEnglishCount(count, 'operations alert')}`,
  operationsAlertBadgeAtLeast: (count: number) => `${count}+`,
};
