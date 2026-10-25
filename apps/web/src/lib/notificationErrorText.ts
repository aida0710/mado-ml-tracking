import {
  notificationErrorLabels,
  notificationsTextTemplates,
} from '../i18n/notifications';

// 送り先から返った番号（HTTPのステータスかSMTPの応答コード）を含むコード。
const HTTP_STATUS_CODE = /^notification_http_(\d{3})$/;
const SMTP_REPLY_CODE = /^notification_smtp_(\d{3})$/;
// `<kind>_sender_unavailable`: APIサーバーが、その種類の通知先へ送る手段を持っていない。
const SENDER_UNAVAILABLE_CODE = /_sender_unavailable$/;

/**
 * 通知が届かなかった理由。テストの結果と配信の履歴に出す。APIは安全な失敗コードだけを保存する。
 * 知らないコードは、報告できるようにそのまま残す。
 */
export function describeNotificationError(code: string): string {
  const known = notificationErrorLabels[code];
  if (known) return known;
  const httpStatus = HTTP_STATUS_CODE.exec(code)?.[1];
  if (httpStatus) return notificationsTextTemplates.notificationErrorHttp(httpStatus);
  const smtpReply = SMTP_REPLY_CODE.exec(code)?.[1];
  if (smtpReply) return notificationsTextTemplates.notificationErrorSmtp(smtpReply);
  if (SENDER_UNAVAILABLE_CODE.test(code)) return notificationErrorLabels.sender_unavailable!;
  return notificationsTextTemplates.notificationErrorUnknown(code);
}
