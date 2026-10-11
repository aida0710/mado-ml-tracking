import { formatEnglishCount } from '../formatEnglishCount';
import type { OperationsAlertKind } from '@mmt/contracts';

// The operations alert badge in the header and the plugin delivery status.
export const operationsText = {
  operationsAlerts: "Operations alerts",
  operationsAlertsNone: "No open operations alerts",
  operationsAlertsLoadFailed: "Could not load operations alerts",
  operationsAlertOpenedAt: "Detected",
  pluginOutbox: "Event delivery status",
  pluginOutboxPending: "Undelivered",
  pluginOutboxSending: "Sending",
  pluginOutboxOldestPending: "Oldest undelivered event",
  pluginOutboxMaxAttempts: "Highest attempt count",
  pluginOutboxLastError: "Last error",
  pluginOutboxLastDelivered: "Last delivery",
  pluginOutboxStalled:
    "Delivery is backlogged (undelivered for over 15 minutes or failed at least five times). Check the plugin, then press “Resend event” after recovery.",
} as const;

export const operationsAlertKindLabels: Record<OperationsAlertKind, string> = {
  'job.heartbeat_stale': "Job heartbeat lost",
  'worker.offline': "Worker stopped",
  'plugin.delivery_stalled': "Plugin delivery backlog",
};

export const operationsTextTemplates = {
  operationsAlertCount: (count: number) => formatEnglishCount(count, 'operations alert'),
};
