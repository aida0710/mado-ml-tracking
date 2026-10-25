import { createHmac, randomUUID } from 'node:crypto';
import type { NotificationChannelKind, NotificationEvent } from '@mmt/contracts';
import { createEmailNotificationSender, type SmtpSettings } from './emailNotificationSender.js';

// 受信側が遅くても、outboxの配信処理や通知先のテストのリクエストを止めたままにしない。
export const NOTIFICATION_DEADLINE_MS = 5000;
// Slackはsectionのテキストが3000文字を超えると拒む。長いRunのエラーはそれより十分短く切る。
const MAX_SLACK_ERROR_LENGTH = 500;
// 製品名をmado ML Trackingに変える前の値のまま。受信側が許可リストに入れていることがある。
const USER_AGENT = 'mado-model-tracking-notifications';

/** 環境変数を解決した通知先。送信処理が必要とする形。 */
export interface NotificationDestination {
  kind: NotificationChannelKind;
  name: string;
  url: string | null;
  secret: string | null;
  recipients: string[];
}

/** 保存した通知先の設定。値そのものではなく、値を持つ環境変数の名前を持つ。 */
export interface NotificationChannelSettings {
  kind: NotificationChannelKind;
  name: string;
  urlEnv: string | null;
  secretEnv: string | null;
  recipients: string[];
}

/** deliveryIdは受信側へ送り（webhookならX-MMT-Delivery）、試行と一緒に保存する。 */
export interface NotificationSender {
  send(channel: NotificationDestination, event: NotificationEvent): Promise<{ deliveryId: string }>;
}

/** 通知先の種類ごとの送信処理。送信処理の無い種類（SMTPが未設定のときのemail）は配信できない。 */
export type NotificationSenders = Partial<Record<NotificationChannelKind, NotificationSender>>;

/** 保存・表示しても安全なコードを持つ失敗。URLや相手の応答は決して含めない。 */
export class NotificationSendError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'NotificationSendError';
  }
}

function hasRequiredVariables(
  channel: NotificationChannelSettings,
  environment: NodeJS.ProcessEnv,
): boolean {
  return [channel.urlEnv, channel.secretEnv].every(
    (name) => name === null || Boolean(environment[name]),
  );
}

export function isNotificationChannelConfigured(
  channel: NotificationChannelSettings,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return hasRequiredVariables(channel, environment);
}

export function resolveNotificationDestination(
  channel: NotificationChannelSettings,
  environment: NodeJS.ProcessEnv = process.env,
): NotificationDestination {
  if (!hasRequiredVariables(channel, environment))
    throw new NotificationSendError('notification_channel_unconfigured');
  return {
    kind: channel.kind,
    name: channel.name,
    url: channel.urlEnv === null ? null : environment[channel.urlEnv]!,
    secret: channel.secretEnv === null ? null : environment[channel.secretEnv]!,
    recipients: channel.recipients,
  };
}

/** X-MMT-Signatureの値。リクエストの本文そのままを、通知先のsecretで計算したHMAC-SHA256。 */
export function webhookSignature(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

// Slackはmrkdwnの中の&、<、>を制御文字として扱う。
function escapeSlack(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shorten(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/** Incoming Webhookのpayload。`text`は通知用の代替テキスト、blocksは整形したメッセージ。 */
export function slackMessage(event: NotificationEvent): { text: string; blocks: unknown[] } {
  const title = escapeSlack(event.title);
  const heading = event.url ? `*<${event.url}|${title}>*` : `*${title}*`;
  const fields: string[] = [];
  if (event.project) fields.push(`*プロジェクト*\n${escapeSlack(event.project.name)}`);
  if (event.run) {
    fields.push(`*Run*\n${escapeSlack(event.run.name)}`);
    fields.push(`*実験*\n${escapeSlack(event.run.experimentName)}`);
    fields.push(`*種別・状態*\n${event.run.kind} / ${event.run.status}`);
  }
  for (const [key, value] of Object.entries(event.details))
    fields.push(`*${escapeSlack(key)}*\n${escapeSlack(String(value))}`);
  const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text: heading } }];
  // Slackの1つのsectionに入るfieldsは最大10個。
  if (fields.length)
    blocks.push({
      type: 'section',
      fields: fields.slice(0, 10).map((text) => ({ type: 'mrkdwn', text })),
    });
  if (event.run?.error)
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `\`\`\`${escapeSlack(shorten(event.run.error, MAX_SLACK_ERROR_LENGTH))}\`\`\``,
      },
    });
  const prefix = event.project ? `[${event.project.name}] ` : '';
  return { text: `${prefix}${event.title}`, blocks };
}

function destinationUrl(channel: NotificationDestination): URL {
  let url: URL;
  try {
    url = new URL(channel.url ?? '');
  } catch {
    throw new NotificationSendError('notification_url_invalid');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new NotificationSendError('notification_url_invalid');
  return url;
}

async function postJson(
  request: { url: URL; body: string; headers: Record<string, string> },
  options: { fetcher: typeof fetch; deadlineMs: number },
): Promise<void> {
  let response: Response;
  try {
    response = await options.fetcher(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, ...request.headers },
      body: request.body,
      signal: AbortSignal.timeout(options.deadlineMs),
      // リダイレクトに従うと、管理者が選んでいないホストへpayloadが送られうる。
      redirect: 'manual',
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new NotificationSendError(
      isTimeout ? 'notification_timeout' : 'notification_destination_unavailable',
    );
  }
  // 応答の本文は使わないので、読まずに接続を解放する。
  await response.body?.cancel().catch(() => undefined);
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
    throw new NotificationSendError('notification_redirect_refused');
  if (!response.ok) throw new NotificationSendError(`notification_http_${response.status}`);
}

export function createNotificationSenders(
  options: { fetcher?: typeof fetch; deadlineMs?: number; smtp?: SmtpSettings | null } = {},
): NotificationSenders {
  const transport = {
    fetcher: options.fetcher ?? fetch,
    deadlineMs: options.deadlineMs ?? NOTIFICATION_DEADLINE_MS,
  };
  return {
    slack_webhook: {
      async send(channel, event) {
        const deliveryId = randomUUID();
        await postJson(
          {
            url: destinationUrl(channel),
            body: JSON.stringify(slackMessage(event)),
            headers: {},
          },
          transport,
        );
        return { deliveryId };
      },
    },
    webhook: {
      async send(channel, event) {
        if (!channel.secret) throw new NotificationSendError('notification_channel_unconfigured');
        const deliveryId = randomUUID();
        const body = JSON.stringify(event);
        await postJson(
          {
            url: destinationUrl(channel),
            body,
            headers: {
              'X-MMT-Event': event.type,
              'X-MMT-Event-Id': event.id,
              'X-MMT-Delivery': deliveryId,
              'X-MMT-Signature': webhookSignature(channel.secret, body),
            },
          },
          transport,
        );
        return { deliveryId };
      },
    },
    // emailはMMT_SMTP_URLを設定したときだけ送る。未設定なら、その配信は利用不可として失敗する。
    ...(options.smtp ? { email: createEmailNotificationSender({ smtp: options.smtp }) } : {}),
  };
}
