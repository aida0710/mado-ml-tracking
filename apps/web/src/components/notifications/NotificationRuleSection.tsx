import { useState } from 'react';
import type { NotificationChannel, NotificationRule, RunKind } from '@mmt/contracts';
import { NOTIFICATION_EVENT_TYPES } from '@mmt/contracts';
import { useAuth } from '../../hooks/useAuth';
import { useMutation } from '../../hooks/useMutation';
import type { NotificationSettingsState } from '../../hooks/useNotificationSettings';
import { isGlobalAdmin } from '../../lib/permissions';
import { buildRuleCreate, describeRuleFilter } from '../../lib/notificationInput';
import { defaultRuleChannelId } from '../../lib/notificationChannelReadiness';
import { getFieldValue } from '../../lib/formValues';
import type { FormField } from '../../types/form';
import { ResponsiveTable } from '../ResponsiveTable';
import { ErrorNotice, Resource } from '../Feedback';
import { FormDialog } from '../FormDialog';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import {
  notificationChannelKindLabels,
  notificationEventTypeLabels,
} from '../../i18n/notifications';
import { formatList } from '../../i18n/textJoining';

const RUN_KINDS: RunKind[] = ['training', 'finetuning', 'inference', 'evaluation', 'processing'];
const runKindLabel = (kind: RunKind) => text[kind];

/**
 * The Project's notification rules. A rule needs a channel, which only a global administrator
 * adds, so without one the button stays disabled and says whom to ask.
 */
export function NotificationRuleSection({ settings }: { settings: NotificationSettingsState }) {
  useLocale();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const toggle = useMutation();
  const channels = settings.channels.value;
  const hasNoChannel = channels !== undefined && channels.length === 0;
  const channelName = (channelId: string) =>
    channels?.find((channel) => channel.id === channelId)?.name ?? channelId;
  const setEnabled = (rule: NotificationRule) =>
    void toggle
      .run(() => settings.setRuleEnabled(rule.id, !rule.enabled))
      .then((updated) => updated && settings.rules.reload());
  return (
    <>
      <div className="section-heading">
        <h3>{text.notificationRules}</h3>
        <button
          className="button small"
          disabled={channels === undefined || hasNoChannel}
          onClick={() => setIsCreating(true)}
        >
          {text.newNotificationRule}
        </button>
      </div>
      {hasNoChannel && (
        <p className="notice">
          {isGlobalAdmin(user)
            ? text.notificationRuleNeedsChannelAdmin
            : text.notificationRuleNeedsChannel}
        </p>
      )}
      <p className="muted">{text.notificationRuleFixedSettings}</p>
      <ErrorNotice message={toggle.error} />
      <Resource query={settings.rules}>
        {(rules) => (
          <ResponsiveTable
            rows={rules}
            rowKey={(rule) => rule.id}
            empty={text.notificationRulesEmpty}
            columns={[
              {
                key: 'channel',
                priority: 'primary',
                header: text.notificationRuleChannel,
                render: (rule) => channelName(rule.channelId),
              },
              {
                key: 'events',
                priority: 'secondary',
                header: text.notificationRuleEvents,
                render: (rule) =>
                  formatList(rule.eventTypes.map((type) => notificationEventTypeLabels[type])),
              },
              {
                key: 'filter',
                priority: 'secondary',
                header: text.notificationRuleFilter,
                render: (rule) => describeRuleFilter(rule.filter, runKindLabel),
              },
              {
                key: 'enabled',
                priority: 'primary',
                header: text.status,
                render: (rule) => (rule.enabled ? text.enabled : text.disabled),
              },
              {
                key: 'actions',
                priority: 'secondary',
                header: text.actions,
                render: (rule) => (
                  <button
                    className="button small"
                    disabled={toggle.pending}
                    onClick={() => setEnabled(rule)}
                  >
                    {rule.enabled ? text.notificationDisable : text.notificationEnable}
                  </button>
                ),
              },
            ]}
          />
        )}
      </Resource>
      {isCreating && channels && (
        <FormDialog
          title={text.newNotificationRule}
          fields={ruleFields(settings, channels)}
          notice={(values) =>
            channels.find((channel) => channel.id === getFieldValue(values, 'channelId'))
              ?.configured === false && (
              <p className="notice warning" role="status">
                {text.notificationRuleChannelUnconfigured}
              </p>
            )
          }
          onSubmit={(values) => settings.createRule(buildRuleCreate(values))}
          onSaved={() => {
            setIsCreating(false);
            settings.rules.reload();
          }}
          onClose={() => setIsCreating(false)}
          submitLabel={text.create}
        />
      )}
    </>
  );
}

// A channel without its server settings stays selectable (it may be set up later) but says so.
function channelChoiceLabel(channel: NotificationChannel): string {
  const kind = notificationChannelKindLabels[channel.kind];
  return channel.configured
    ? textTemplates.notificationChannelChoice(channel.name, kind)
    : textTemplates.notificationChannelChoiceUnconfigured(channel.name, kind);
}

function ruleFields(
  settings: NotificationSettingsState,
  channels: NotificationChannel[],
): FormField[] {
  return [
    {
      name: 'channelId',
      label: text.notificationRuleChannel,
      type: 'select',
      required: true,
      defaultValue: defaultRuleChannelId(channels),
      options: channels.map((channel) => ({
        value: channel.id,
        label: channelChoiceLabel(channel),
      })),
    },
    {
      name: 'eventTypes',
      label: text.notificationRuleEvents,
      type: 'checkboxes',
      required: true,
      defaultValue: ['run.failed'],
      options: NOTIFICATION_EVENT_TYPES.map((type) => ({
        value: type,
        label: notificationEventTypeLabels[type],
      })),
    },
    {
      name: 'runKinds',
      label: text.notificationRuleRunKinds,
      type: 'checkboxes',
      options: RUN_KINDS.map((kind) => ({ value: kind, label: runKindLabel(kind) })),
    },
    {
      name: 'experimentIds',
      label: text.notificationRuleExperiments,
      type: 'checkboxes',
      options: (settings.experiments.value ?? []).map((experiment) => ({
        value: experiment.id,
        label: experiment.name,
      })),
    },
    { name: 'automationOnly', label: text.notificationRuleAutomationOnly, type: 'checkbox' },
  ];
}
