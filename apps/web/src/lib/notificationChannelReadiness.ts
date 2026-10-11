import type { NotificationChannel, NotificationChannelKind } from '@mmt/contracts';
import { getFieldValue, type FormValues } from './formValues';

/**
 * The variable names a channel form refers to for its kind: Slack its URL, a webhook its URL and
 * signing key, email none (it sends through the server's SMTP settings).
 */
export function referencedEnvironmentNames(
  kind: NotificationChannelKind,
  values: FormValues,
): string[] {
  if (kind === 'email') return [];
  const names = [getFieldValue(values, 'urlEnv')];
  if (kind === 'webhook') names.push(getFieldValue(values, 'secretEnv'));
  return names.map((name) => name.trim()).filter(Boolean);
}

/**
 * Referenced names the API server has no value for. While the server's list is still loading
 * (`available` undefined) nothing is reported, so the form does not warn before it knows.
 */
export function missingEnvironmentNames(
  referenced: string[],
  available: string[] | undefined,
): string[] {
  if (!available) return [];
  return referenced.filter((name) => !available.includes(name));
}

/** The channel a new rule starts with: the first one that can send, or else the first one. */
export function defaultRuleChannelId(channels: NotificationChannel[]): string {
  return (channels.find((channel) => channel.configured) ?? channels[0])?.id ?? '';
}
