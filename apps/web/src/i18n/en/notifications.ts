import type {
  NotificationChannelKind,
  NotificationDeliveryStatus,
  NotificationEventType,
} from '@mmt/contracts';

// Notification channels, rules and the delivery history in the Project settings.
export const notificationsText = {
  notifications: "Notifications",
  notificationsDescription:
    "Notify Slack, webhooks, or email about events such as failed runs. Global administrators register channels; project administrators choose events through rules.",
  notificationChannels: "Notification channels",
  newNotificationChannel: "Add notification channel",
  editNotificationChannel: "Update notification channel",
  notificationChannelsEmpty: "No available notification channels yet",
  notificationChannelKind: "Type",
  notificationChannelScope: "Available projects",
  notificationScopeGlobal: "All projects",
  notificationScopeProject: "This project only",
  notificationDestination: "Destination",
  notificationConfigured: "Delivery settings",
  notificationConfiguredYes: "Configured",
  notificationConfiguredNo: "Not set",
  notificationSmtpUnconfigured: "Not configured (SMTP delivery settings missing)",
  notificationUrlEnv: "Environment variable containing the URL (starts with MMT_NOTIFICATION_)",
  notificationSecretEnv: "Environment variable containing the signing secret (starts with MMT_NOTIFICATION_)",
  notificationRecipients: "Recipient email addresses (one per line)",
  notificationChannelHint:
    "Store URLs and signing secrets in API server environment variables. Register only variable names here. Values are never stored in the UI or database.",
  notificationEmailHint:
    "Email is sent only when SMTP settings (MMT_SMTP_URL, MMT_SMTP_FROM) are configured on the API server. Channels can be created without SMTP settings, but attempts are recorded as failed in delivery history.",
  notificationTest: "Send test",
  notificationTestDelivered: "Test notification delivered",
  notificationTestFailed: "Test notification failed",
  notificationTestNotInHistory:
    "Test notifications are not recorded in delivery history. Results are recorded in the audit log under notification channel tests.",
  notificationEnvNameInvalid:
    "Environment variable names must start with MMT_NOTIFICATION_ and contain only uppercase letters, numbers, and underscores",
  notificationRules: "Notification rules",
  newNotificationRule: "Create notification rule",
  notificationRulesEmpty: "No notification rules yet",
  notificationRuleChannel: "Notification channels",
  notificationRuleEvents: "Events to notify",
  notificationRuleFilter: "Conditions",
  notificationRuleFilterNone: "All",
  notificationRuleRunKinds: "Run kinds (none selected means all)",
  notificationRuleExperiments: "Experiments (none selected means all)",
  notificationRuleAutomationOnly: "Only runs launched by automation",
  notificationRuleFixedSettings:
    "Only enabled/disabled status can be changed after creation. Create a new rule to change its conditions.",
  notificationRuleChannelRequired: "Select a notification channel",
  notificationRuleEventsRequired: "Select at least one event",
  notificationEnable: "Enable",
  notificationDisable: "Disable",
  notificationDeliveries: "Recent delivery history",
  notificationDeliveriesEmpty: "No deliveries yet",
  notificationDeliveryEvent: "Event",
  notificationDeliveryAttempts: "Attempts",
  notificationDeliveryError: "Failure reason",
  notificationDeliveryCreatedAt: "Occurred at",
} as const;

export const notificationChannelKindLabels: Record<NotificationChannelKind, string> = {
  slack_webhook: 'Slack（Incoming Webhook）',
  webhook: "Webhook (signed)",
  email: "Email",
};

export const notificationEventTypeLabels: Record<NotificationEventType, string> = {
  'run.failed': "Run failed",
  'run.canceled': "Run stopped",
  'run.finished': "Run completed",
  'automation.failed': "Automation failed",
  'job.heartbeat_stale': "Job heartbeat lost",
  'job.heartbeat_recovered': "Job heartbeat recovered",
  'worker.offline': "Worker stopped",
  'plugin.delivery_stalled': "Plugin delivery backlog",
};

export const notificationDeliveryStatusLabels: Record<NotificationDeliveryStatus, string> = {
  pending: "Pending delivery",
  sending: "Sending",
  delivered: "Delivered",
  failed: "Failed",
};

// Failure codes stored by the API (packages/platform notification senders and the dispatcher).
export const notificationErrorLabels = {
  notification_channel_unconfigured:
    "The URL or signing secret environment variable referenced by this channel is not set on the API server",
  notification_channel_disabled: "Notification channel is disabled",
  notification_rule_disabled: "Notification rule is disabled",
  notification_url_invalid: "Invalid URL in environment variable (use http:// or https:// without embedded credentials)",
  notification_destination_unavailable: "Could not connect to the destination",
  notification_timeout: "The destination did not respond in time",
  notification_redirect_refused: "Delivery was skipped because the destination returned a redirect",
  notification_recipients_invalid: "Invalid recipient email address",
  notification_smtp_auth_failed: "SMTP authentication failed",
  notification_smtp_tls_failed: "TLS connection to the SMTP server failed",
  notification_smtp_recipients_rejected: "The SMTP server rejected the recipient",
  notification_delivery_failed: "An unexpected error occurred during delivery",
  notification_dispatch_failed: "An unexpected error occurred during delivery",
  sender_unavailable: "The API server has no delivery configuration for this channel type",
} satisfies Record<string, string>;

export const notificationsTextTemplates = {
  notificationRuleFilterRunKinds: (kinds: string) => `Run kind: ${kinds}`,
  notificationRuleFilterExperiments: (count: number) => `Experiments: ${count}`,
  notificationTestError: (reason: string) => `Test notification failed: ${reason}`,
  notificationErrorHttp: (status: string) => `The destination returned HTTP ${status}`,
  notificationErrorSmtp: (reply: string) => `The SMTP server returned ${reply}`,
  notificationErrorUnknown: (code: string) => `Delivery failed (${code})`,
};
