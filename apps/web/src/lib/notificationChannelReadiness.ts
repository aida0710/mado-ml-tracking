import type { NotificationChannel, NotificationChannelKind } from '@mmt/contracts';
import { getFieldValue, type FormValues } from './formValues';

/**
 * 通知先のフォームが種類ごとに参照する変数名。SlackはそのURL、webhookはURLと署名の鍵、メールは
 * 無し（サーバーのSMTPの設定で送る）。
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
 * 参照している名前のうち、APIサーバーに値が無いもの。サーバーの一覧を読み込んでいる間
 * （`available`がundefined）は何も挙げず、分かる前にフォームが警告しないようにする。
 */
export function missingEnvironmentNames(
  referenced: string[],
  available: string[] | undefined,
): string[] {
  if (!available) return [];
  return referenced.filter((name) => !available.includes(name));
}

/** 新しいルールで最初に選ぶ通知先。送れる最初のもの、無ければ一覧の最初のもの。 */
export function defaultRuleChannelId(channels: NotificationChannel[]): string {
  return (channels.find((channel) => channel.configured) ?? channels[0])?.id ?? '';
}
