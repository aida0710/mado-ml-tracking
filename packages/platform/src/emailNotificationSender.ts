import { randomUUID } from 'node:crypto';
import nodemailer, {
  type NodemailerError,
  type SMTPTransportOptions,
  type Transporter,
} from 'nodemailer';
import { NOTIFICATION_RECIPIENTS_MAX, type NotificationEvent } from '@mmt/contracts';
import {
  NotificationSendError,
  type NotificationDestination,
  type NotificationSender,
} from './notificationSenders.js';

// SMTPは何度もやり取りが要り（greeting、EHLO、STARTTLS、AUTH、MAIL/RCPT/DATA）、中継サーバーは
// わざとgreetingを遅らせることが多いので、HTTPで送るsenderの5秒の2倍を与える。
export const EMAIL_NOTIFICATION_DEADLINE_MS = 10_000;
// Runの長いエラーは切り詰め、スタックトレースでメールがログの貼り付けにならないようにする。
const MAX_EMAIL_ERROR_LENGTH = 2000;
// メールクライアントはどのみち長い件名を切る。タイトルの残りは本文に残る。
const MAX_SUBJECT_LENGTH = 200;
// RFC 5321はforward-pathを256オクテットに制限する。320はlocal@domainの一般的な上限。
const MAX_ADDRESS_LENGTH = 320;
// 表示名なしの1つのアドレス。空白、リストの区切り、ヘッダーの構文を含まない。
const EMAIL_ADDRESS_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+$/;
// MMT_SMTP_FROMには表示名を付けてよい: "mado ML Tracking <mmt@example.com>"。
const NAMED_ADDRESS_PATTERN = /^([^<>\r\n]*)<([^<>]+)>$/;

/** MMT_SMTP_URLとMMT_SMTP_FROMから得たSMTPサーバーと送信元アドレス。 */
export interface SmtpSettings {
  /** smtp://（提供されればSTARTTLS）かsmtps://（最初からTLS）。user:passwordを付けてもよい。 */
  url: string;
  from: string;
}

function isEmailAddress(value: string): boolean {
  return value.length <= MAX_ADDRESS_LENGTH && EMAIL_ADDRESS_PATTERN.test(value);
}

function isSenderAddress(value: string): boolean {
  const named = NAMED_ADDRESS_PATTERN.exec(value.trim());
  return isEmailAddress(named ? named[2]!.trim() : value.trim());
}

/**
 * MMT_SMTP_URLとMMT_SMTP_FROMを検証する。SMTPが設定されていなければnullを返し、メールの通知先
 * は保存されたまま届けられない状態になる。URLにはパスワードが入るので、エラーには変数名だけを
 * 書く。
 */
export function parseSmtpSettings(environment: {
  url: string | undefined;
  from: string | undefined;
}): SmtpSettings | null {
  if (!environment.url) {
    if (environment.from) throw new Error('MMT_SMTP_FROM requires MMT_SMTP_URL');
    return null;
  }
  if (!URL.canParse(environment.url)) throw new Error('MMT_SMTP_URL must be a URL');
  const url = new URL(environment.url);
  if (!['smtp:', 'smtps:'].includes(url.protocol) || !url.hostname)
    throw new Error('MMT_SMTP_URL must be smtp://host[:port] or smtps://host[:port]');
  // クエリのオプションはnodemailerのURLの解析に渡り、TLSの検証を切れてしまう。
  if (url.search) throw new Error('MMT_SMTP_URL must not contain query options');
  if (!environment.from) throw new Error('MMT_SMTP_FROM is required when MMT_SMTP_URL is set');
  if (!isSenderAddress(environment.from))
    throw new Error('MMT_SMTP_FROM must be an email address, optionally with a display name');
  return { url: environment.url, from: environment.from.trim() };
}

function smtpTransportOptions(smtp: SmtpSettings, deadlineMs: number): SMTPTransportOptions {
  const url = new URL(smtp.url);
  return {
    // URLはIPv6リテラルの角括弧を残すが、ソケットには括弧なしのアドレスが要る。
    host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
    ...(url.port ? { port: Number(url.port) } : {}),
    secure: url.protocol === 'smtps:',
    ...(url.username
      ? {
          auth: {
            user: decodeURIComponent(url.username),
            pass: decodeURIComponent(url.password),
          },
        }
      : {}),
    connectionTimeout: deadlineMs,
    greetingTimeout: deadlineMs,
    socketTimeout: deadlineMs,
    dnsTimeout: deadlineMs,
    // 証明書は常に検証する。社内のCAはNODE_EXTRA_CA_CERTSで追加する。
    tls: { rejectUnauthorized: true },
    // メッセージはイベントのフィールドだけから組み立てる。何があってもsenderにファイルやURLを
    // 読ませない。
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

function shorten(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/**
 * 件名とプレーンテキストの本文。挙げたイベントのフィールドだけを使い、未知のプロパティは
 * 使わない。
 */
export function emailMessage(event: NotificationEvent): { subject: string; text: string } {
  const prefix = event.project ? `[${event.project.name}] ` : '';
  // Runの名前の改行で、新しいヘッダー行が始まってはいけない。
  const subject = shorten(`${prefix}${event.title}`.replace(/[\r\n]+/g, ' '), MAX_SUBJECT_LENGTH);
  // ラベルはSlackのメッセージに合わせ、どちらの通知先でも同じに読めるようにする。
  const lines: string[] = [event.title, ''];
  if (event.project) lines.push(`プロジェクト: ${event.project.name}`);
  if (event.run) {
    lines.push(`Run: ${event.run.name}`);
    lines.push(`実験: ${event.run.experimentName}`);
    lines.push(`種別・状態: ${event.run.kind} / ${event.run.status}`);
  }
  for (const [key, value] of Object.entries(event.details)) lines.push(`${key}: ${String(value)}`);
  if (event.run?.error) lines.push('', 'エラー:', shorten(event.run.error, MAX_EMAIL_ERROR_LENGTH));
  if (event.url) lines.push('', event.url);
  lines.push('', `発生日時: ${event.occurredAt}`);
  return { subject, text: `${lines.join('\n')}\n` };
}

function validRecipients(channel: NotificationDestination): string[] {
  const recipients = channel.recipients.map((recipient) => recipient.trim());
  if (
    recipients.length === 0 ||
    recipients.length > NOTIFICATION_RECIPIENTS_MAX ||
    !recipients.every(isEmailAddress)
  )
    throw new NotificationSendError('notification_recipients_invalid');
  return recipients;
}

// コードだけを返す。nodemailerのメッセージやSMTPの応答は、アドレスやサーバーのバナーを
// 含むことがある。
function smtpErrorCode(error: unknown): string {
  const failure = error as NodemailerError;
  switch (failure.code) {
    case 'ETIMEDOUT':
      return 'notification_timeout';
    case 'EAUTH':
    case 'ENOAUTH':
      return 'notification_smtp_auth_failed';
    case 'ETLS':
      return 'notification_smtp_tls_failed';
    case 'EENVELOPE':
      return 'notification_smtp_recipients_rejected';
  }
  if (typeof failure.responseCode === 'number') return `notification_smtp_${failure.responseCode}`;
  return 'notification_destination_unavailable';
}

/**
 * 通知をプレーンテキストのメールで送る。transporterはsenderごとに作る。nodemailerのSMTPの
 * transportはメッセージごとに1つの接続を開くので、中継サーバーが落ちても壊れたプールが残らない。
 */
export function createEmailNotificationSender(options: {
  smtp: SmtpSettings;
  deadlineMs?: number;
  /** SMTPのtransportを置き換える。nodemailerのJSONやstreamのtransportを使うテスト用。 */
  transporter?: Transporter;
}): NotificationSender {
  const deadlineMs = options.deadlineMs ?? EMAIL_NOTIFICATION_DEADLINE_MS;
  const transporter =
    options.transporter ??
    nodemailer.createTransport(smtpTransportOptions(options.smtp, deadlineMs));
  return {
    async send(channel, event) {
      const to = validRecipients(channel);
      const deliveryId = randomUUID();
      const { subject, text } = emailMessage(event);
      const sending = transporter.sendMail({
        from: options.smtp.from,
        to,
        subject,
        text,
        headers: {
          'X-MMT-Event': event.type,
          'X-MMT-Event-Id': event.id,
          'X-MMT-Delivery': deliveryId,
        },
      });
      // ソケットのタイムアウトは各段階を抑え、これは複数の段階からなるやり取り全体を抑える。
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new NotificationSendError('notification_timeout')),
          deadlineMs,
        );
      });
      try {
        await Promise.race([
          sending.catch((error: unknown) => {
            throw new NotificationSendError(smtpErrorCode(error));
          }),
          deadline,
        ]);
      } finally {
        clearTimeout(timer);
      }
      return { deliveryId };
    },
  };
}
