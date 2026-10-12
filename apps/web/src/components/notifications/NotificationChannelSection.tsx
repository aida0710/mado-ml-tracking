import { useState } from 'react';
import type { NotificationChannel, NotificationChannelKind, NotificationTestResult } from '@mmt/contracts';
import { notificationsApi } from '../../api/notifications';
import { useAuth } from '../../hooks/useAuth';
import { useMutation } from '../../hooks/useMutation';
import { useQuery } from '../../hooks/useQuery';
import type { NotificationSettingsState } from '../../hooks/useNotificationSettings';
import { isGlobalAdmin } from '../../lib/permissions';
import { describeNotificationError } from '../../lib/notificationErrorText';
import { buildChannelCreate, buildChannelPatch } from '../../lib/notificationInput';
import {
  missingEnvironmentNames,
  referencedEnvironmentNames,
} from '../../lib/notificationChannelReadiness';
import { getFieldValue } from '../../lib/formValues';
import type { FieldSuggestions, FormField, FormValues } from '../../types/form';
import { ResponsiveTable } from '../ResponsiveTable';
import { ErrorNotice, Resource } from '../Feedback';
import { FormDialog } from '../FormDialog';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { notificationChannelKindLabels } from '../../i18n/notifications';
import { formatList, joinSentences } from '../../i18n/textJoining';

/**
 * The channels a Project's rules may use. Only global administrators add and change them (as in
 * the API); a Project admin is told whom to ask instead of meeting an empty list.
 */
export function NotificationChannelSection({
  settings,
  projectId,
}: {
  settings: NotificationSettingsState;
  projectId: string;
}) {
  useLocale();
  const { user } = useAuth();
  const canEditChannels = isGlobalAdmin(user);
  // The API refuses the names to anyone else, so only administrators ask for them.
  const environmentNames = useQuery(
    canEditChannels ? 'notification-environment-names' : null,
    notificationsApi.environmentNames,
  );
  const [editing, setEditing] = useState<NotificationChannel | 'new' | null>(null);
  const [savedUnconfigured, setSavedUnconfigured] = useState<string | null>(null);
  const test = useMutation();
  const [testResult, setTestResult] = useState<NotificationTestResult | null>(null);
  const runTest = (channel: NotificationChannel) =>
    void test
      .run(() => settings.testChannel(channel.id))
      .then((result) => {
        if (!result) return;
        setTestResult(result);
      });
  return (
    <>
      <div className="section-heading">
        <h3>{text.notificationChannels}</h3>
        {canEditChannels && (
          <button className="button small" onClick={() => setEditing('new')}>
            {text.newNotificationChannel}
          </button>
        )}
      </div>
      <p className="muted">
        {canEditChannels
          ? joinSentences([text.notificationChannelHint, text.notificationEmailHint])
          : text.notificationChannelsAdminOnly}
      </p>
      {savedUnconfigured && (
        <div className="notice warning" role="status">
          {textTemplates.notificationChannelSavedUnconfigured(savedUnconfigured)}
        </div>
      )}
      {testResult && (
        <div className="notice" role="status">
          {testResult.delivered
            ? text.notificationTestDelivered
            : `${textTemplates.notificationTestError(
                describeNotificationError(testResult.error ?? ''),
              )} ${text.notificationTestNotInHistory}`}
        </div>
      )}
      <ErrorNotice message={test.error} />
      <Resource query={settings.channels}>
        {(channels) => (
          <ResponsiveTable
            rows={channels}
            rowKey={(channel) => channel.id}
            empty={text.notificationChannelsEmpty}
            columns={[
              {
                key: 'name',
                priority: 'primary',
                header: text.name,
                render: (channel) => channel.name,
              },
              {
                key: 'kind',
                priority: 'secondary',
                header: text.notificationChannelKind,
                render: (channel) => notificationChannelKindLabels[channel.kind],
              },
              {
                key: 'scope',
                priority: 'secondary',
                header: text.notificationChannelScope,
                render: (channel) =>
                  channel.projectId ? text.notificationScopeProject : text.notificationScopeGlobal,
              },
              {
                key: 'destination',
                priority: 'secondary',
                header: text.notificationDestination,
                className: 'mono',
                render: (channel) =>
                  channel.kind === 'email' ? channel.recipients.join(', ') : channel.urlEnv,
              },
              {
                key: 'configured',
                priority: 'secondary',
                header: text.notificationConfigured,
                render: (channel) => configuredLabel(channel),
              },
              {
                key: 'enabled',
                priority: 'primary',
                header: text.status,
                render: (channel) => (channel.enabled ? text.enabled : text.disabled),
              },
              ...(canEditChannels
                ? [
                    {
                      key: 'actions',
                      priority: 'secondary' as const,
                      header: text.actions,
                      render: (channel: NotificationChannel) => (
                        <div className="access-actions">
                          <button className="button small" onClick={() => setEditing(channel)}>
                            {text.edit}
                          </button>
                          <button
                            className="button small"
                            disabled={test.pending}
                            onClick={() => runTest(channel)}
                          >
                            {text.notificationTest}
                          </button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Resource>
      {editing && (
        <FormDialog
          title={editing === 'new' ? text.newNotificationChannel : text.editNotificationChannel}
          fields={channelFields({
            channel: editing === 'new' ? undefined : editing,
            environmentNames: environmentNames.value,
          })}
          notice={(values) => (
            <MissingEnvironmentNotice
              names={missingEnvironmentNames(
                referencedEnvironmentNames(channelKind(values, editing), values),
                environmentNames.value,
              )}
            />
          )}
          onSubmit={(values) =>
            editing === 'new'
              ? settings.createChannel(buildChannelCreate(values, projectId))
              : settings.updateChannel(editing.id, buildChannelPatch(values, editing))
          }
          onSaved={(saved) => {
            setEditing(null);
            setSavedUnconfigured(saved.configured ? null : saved.name);
            settings.channels.reload();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function MissingEnvironmentNotice({ names }: { names: string[] }) {
  useLocale();
  if (!names.length) return null;
  return (
    <p className="notice warning" role="status">
      {textTemplates.notificationEnvironmentMissing(formatList(names))}
    </p>
  );
}

// An email channel has no variables of its own; it is unconfigured when the server has no SMTP.
function configuredLabel(channel: NotificationChannel): string {
  if (channel.configured) return text.notificationConfiguredYes;
  return channel.kind === 'email'
    ? text.notificationSmtpUnconfigured
    : text.notificationConfiguredNo;
}

// A saved channel keeps its kind; a new one has the kind chosen in the form.
function channelKind(
  values: FormValues,
  editing: NotificationChannel | 'new',
): NotificationChannelKind {
  return editing === 'new'
    ? (getFieldValue(values, 'kind') as NotificationChannelKind)
    : editing.kind;
}

/** The server's variable names that start with what is typed, or a note when it has none. */
function suggestEnvironmentNames(available: string[] | undefined) {
  return async (typed: string): Promise<FieldSuggestions> => {
    if (!available) return { items: [] };
    if (!available.length) return { items: [], note: text.notificationEnvNameNoCandidates };
    const prefix = typed.trim().toUpperCase();
    return { items: available.filter((name) => name.startsWith(prefix)) };
  };
}

function channelFields({
  channel,
  environmentNames,
}: {
  channel?: NotificationChannel;
  environmentNames: string[] | undefined;
}): FormField[] {
  const kindOf = (values: FormValues) => channel?.kind ?? (values.kind as string);
  const suggest = suggestEnvironmentNames(environmentNames);
  return [
    ...(channel
      ? []
      : [
          {
            name: 'kind',
            label: text.notificationChannelKind,
            type: 'select' as const,
            defaultValue: 'slack_webhook',
            options: Object.entries(notificationChannelKindLabels).map(([value, label]) => ({
              value,
              label,
            })),
          },
          {
            name: 'scope',
            label: text.notificationChannelScope,
            type: 'select' as const,
            defaultValue: 'project',
            options: [
              { value: 'project', label: text.notificationScopeProject },
              { value: 'global', label: text.notificationScopeGlobal },
            ],
          },
        ]),
    { name: 'name', label: text.name, required: true, maxLength: 100, defaultValue: channel?.name },
    {
      name: 'urlEnv',
      label: text.notificationUrlEnv,
      required: true,
      placeholder: 'MMT_NOTIFICATION_ALERTS_URL',
      defaultValue: channel?.urlEnv ?? '',
      visible: (values) => kindOf(values) !== 'email',
      suggest,
      offerSuggestionsWhenEmpty: true,
      suggestionsRefreshKey: environmentNames?.length,
      hint: text.notificationEnvNameHint,
    },
    {
      name: 'secretEnv',
      label: text.notificationSecretEnv,
      required: true,
      placeholder: 'MMT_NOTIFICATION_WEBHOOK_SECRET',
      defaultValue: channel?.secretEnv ?? '',
      visible: (values) => kindOf(values) === 'webhook',
      suggest,
      offerSuggestionsWhenEmpty: true,
      suggestionsRefreshKey: environmentNames?.length,
    },
    {
      name: 'recipients',
      label: text.notificationRecipients,
      type: 'textarea',
      required: true,
      placeholder: 'ml-team@example.com',
      defaultValue: channel?.recipients.join('\n') ?? '',
      visible: (values) => kindOf(values) === 'email',
    },
    {
      name: 'enabled',
      label: text.enabled,
      type: 'checkbox',
      defaultValue: String(channel?.enabled ?? true),
    },
  ];
}
