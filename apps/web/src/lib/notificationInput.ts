import type {
  NotificationChannel,
  NotificationChannelCreate,
  NotificationChannelKind,
  NotificationChannelPatch,
  NotificationEventType,
  NotificationRuleCreate,
  NotificationRuleFilter,
  RunKind,
} from '@mmt/contracts';
import {
  getFieldValue,
  getOptionalValue,
  getSelectedValues,
  splitLines,
  type FormValues,
} from './formValues';
import { text } from '../i18n/catalog';
import { notificationsTextTemplates } from '../i18n/notifications';
import { formatList } from '../i18n/textJoining';

/** 通知先の対象範囲の欄。すべてのProjectか、編集中のProjectだけか。 */
export type NotificationChannelScope = 'global' | 'project';

// APIとnotification_channelsのCHECKと同じパターン。APIの項目のパスでなく日本語で問題を
// 示せるよう、フォームでも検査する。
const NOTIFICATION_ENVIRONMENT_NAME = /^MMT_NOTIFICATION_[A-Z0-9_]+$/;

function environmentName(values: FormValues, field: 'urlEnv' | 'secretEnv'): string | null {
  const name = getOptionalValue(values, field) ?? null;
  if (name !== null && !NOTIFICATION_ENVIRONMENT_NAME.test(name))
    throw new Error(text.notificationEnvNameInvalid);
  return name;
}

// APIの規則に合わせる。SlackにはURL、webhookにはURLと署名用のシークレット、メールには宛先が要る。
function destinationSettings(kind: NotificationChannelKind, values: FormValues) {
  return {
    urlEnv: kind === 'email' ? null : environmentName(values, 'urlEnv'),
    secretEnv: kind === 'webhook' ? environmentName(values, 'secretEnv') : null,
    recipients: kind === 'email' ? splitLines(getFieldValue(values, 'recipients')) : [],
  };
}

export function buildChannelCreate(
  values: FormValues,
  projectId: string,
): NotificationChannelCreate {
  const kind = getFieldValue(values, 'kind') as NotificationChannelKind;
  const scope = getFieldValue(values, 'scope') as NotificationChannelScope;
  return {
    kind,
    name: getFieldValue(values, 'name').trim(),
    projectId: scope === 'project' ? projectId : null,
    enabled: getFieldValue(values, 'enabled') !== 'false',
    ...destinationSettings(kind, values),
  };
}

export function buildChannelPatch(
  values: FormValues,
  channel: Pick<NotificationChannel, 'kind'>,
): NotificationChannelPatch {
  return {
    name: getFieldValue(values, 'name').trim(),
    enabled: getFieldValue(values, 'enabled') !== 'false',
    ...destinationSettings(channel.kind, values),
  };
}

export function buildRuleCreate(values: FormValues): NotificationRuleCreate {
  const channelId = getFieldValue(values, 'channelId');
  if (!channelId) throw new Error(text.notificationRuleChannelRequired);
  const eventTypes = getSelectedValues(values, 'eventTypes') as NotificationEventType[];
  if (!eventTypes.length) throw new Error(text.notificationRuleEventsRequired);
  const runKinds = getSelectedValues(values, 'runKinds') as RunKind[];
  const experimentIds = getSelectedValues(values, 'experimentIds');
  const filter: NotificationRuleFilter = {
    ...(runKinds.length ? { runKinds } : {}),
    ...(experimentIds.length ? { experimentIds } : {}),
    ...(getFieldValue(values, 'automationOnly') === 'true' ? { automationOnly: true } : {}),
  };
  return { channelId, eventTypes, filter };
}

/** ルールの表に出す、ルールの絞り込み条件の1行の要約。 */
export function describeRuleFilter(
  filter: NotificationRuleFilter,
  runKindLabel: (kind: RunKind) => string,
): string {
  const parts = [
    filter.runKinds?.length
      ? notificationsTextTemplates.notificationRuleFilterRunKinds(
          formatList(filter.runKinds.map(runKindLabel)),
        )
      : null,
    filter.experimentIds?.length
      ? notificationsTextTemplates.notificationRuleFilterExperiments(filter.experimentIds.length)
      : null,
    filter.automationOnly ? text.notificationRuleAutomationOnly : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' / ') : text.notificationRuleFilterNone;
}
