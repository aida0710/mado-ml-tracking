import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { NotificationChannelCreate, NotificationChannelPatch, NotificationRuleCreate } from '@mmt/contracts';
import {
  itemsOf,
  notificationChannelSchema,
  notificationDeliverySchema,
  notificationEnvironmentNameListSchema,
  notificationRuleSchema,
  notificationTestResultSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

const channelPath = (channelId?: string) =>
  `/api/notification-channels${channelId === undefined ? '' : `/${encodeId(channelId)}`}`;
const rulePath = (projectId: string, ruleId?: string) =>
  `${projectPath(projectId)}/notification-rules${ruleId === undefined ? '' : `/${encodeId(ruleId)}`}`;

// 最近の履歴だけ。APIは1ページを200件までに抑える。
const DELIVERY_HISTORY_LIMIT = 50;

/** 通知先（全体管理者が編集する）、Projectのルールと送信の履歴。 */
export const notificationsApi = {
  /** Projectのルールが使える通知先（全体のものと、そのProject自身のもの）。 */
  projectChannels: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${projectPath(projectId)}/notification-channels`, {
        schema: itemsOf(notificationChannelSchema),
        init: { signal },
      })
    ).items,
  /**
   * APIサーバーのMMT_NOTIFICATION_*の環境変数のうち、値が入っているものの名前（値は返さない）。
   * 全体管理者だけ。
   */
  environmentNames: async (signal?: AbortSignal) =>
    (
      await requestJson(`${channelPath()}/environment-names`, {
        schema: notificationEnvironmentNameListSchema,
        init: { signal },
      })
    ).items,
  createChannel: (body: NotificationChannelCreate) =>
    requestJson(channelPath(), { schema: notificationChannelSchema, init: jsonRequestInit('POST', body) }),
  updateChannel: (channelId: string, body: NotificationChannelPatch) =>
    requestJson(channelPath(channelId), { schema: notificationChannelSchema, init: jsonRequestInit('PATCH', body) }),
  testChannel: (channelId: string) =>
    requestJson(`${channelPath(channelId)}/test`, { schema: notificationTestResultSchema, init: { method: 'POST' } }),
  rules: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(rulePath(projectId), { schema: itemsOf(notificationRuleSchema), init: { signal } })).items,
  createRule: (projectId: string, body: NotificationRuleCreate) =>
    requestJson(rulePath(projectId), { schema: notificationRuleSchema, init: jsonRequestInit('POST', body) }),
  setRuleEnabled: (projectId: string, ruleId: string, enabled: boolean) =>
    requestJson(rulePath(projectId, ruleId), {
      schema: notificationRuleSchema,
      init: jsonRequestInit('PATCH', { enabled }),
    }),
  deliveries: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${projectPath(projectId)}/notification-deliveries?limit=${DELIVERY_HISTORY_LIMIT}`, {
        schema: itemsOf(notificationDeliverySchema),
        init: { signal },
      })
    ).items,
};
