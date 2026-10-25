import type {
  NotificationChannel,
  NotificationChannelCreate,
  NotificationChannelPatch,
  NotificationDelivery,
  NotificationRule,
  NotificationRuleCreate,
  NotificationTestResult,
} from '@mmt/contracts';
import { encodeId, jsonRequest, projectPath, request, requestItems } from './http';

const channelPath = (channelId?: string) =>
  `/notification-channels${channelId === undefined ? '' : `/${encodeId(channelId)}`}`;
const rulePath = (projectId: string, ruleId?: string) =>
  `${projectPath(projectId)}/notification-rules${ruleId === undefined ? '' : `/${encodeId(ruleId)}`}`;

// 最近の履歴だけ。APIは1ページを200件までに抑える。
const DELIVERY_HISTORY_LIMIT = 50;

/** 通知先（全体管理者が編集する）、Projectのルールと送信の履歴。 */
export const notificationsApi = {
  /** Projectのルールが使える通知先（全体のものと、そのProject自身のもの）。 */
  projectChannels: (projectId: string, signal?: AbortSignal) =>
    requestItems<NotificationChannel>(`${projectPath(projectId)}/notification-channels`, signal),
  /**
   * APIサーバーのMMT_NOTIFICATION_*の環境変数のうち、値が入っているものの名前（値は返さない）。
   * 全体管理者だけ。
   */
  environmentNames: (signal?: AbortSignal) =>
    requestItems<string>(`${channelPath()}/environment-names`, signal),
  createChannel: (body: NotificationChannelCreate) =>
    request<NotificationChannel>(channelPath(), jsonRequest('POST', body)),
  updateChannel: (channelId: string, body: NotificationChannelPatch) =>
    request<NotificationChannel>(channelPath(channelId), jsonRequest('PATCH', body)),
  testChannel: (channelId: string) =>
    request<NotificationTestResult>(`${channelPath(channelId)}/test`, { method: 'POST' }),
  rules: (projectId: string, signal?: AbortSignal) =>
    requestItems<NotificationRule>(rulePath(projectId), signal),
  createRule: (projectId: string, body: NotificationRuleCreate) =>
    request<NotificationRule>(rulePath(projectId), jsonRequest('POST', body)),
  setRuleEnabled: (projectId: string, ruleId: string, enabled: boolean) =>
    request<NotificationRule>(rulePath(projectId, ruleId), jsonRequest('PATCH', { enabled })),
  deliveries: (projectId: string, signal?: AbortSignal) =>
    requestItems<NotificationDelivery>(
      `${projectPath(projectId)}/notification-deliveries?limit=${DELIVERY_HISTORY_LIMIT}`,
      signal,
    ),
};
