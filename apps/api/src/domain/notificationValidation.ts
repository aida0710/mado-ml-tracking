import { z } from 'zod';
import { NOTIFICATION_EVENT_TYPES, NOTIFICATION_RECIPIENTS_MAX } from '@mmt/contracts';
import { runKindSchema, uuidSchema } from './validation.js';

// notification_channelsのCHECKと合わせる。前置きを付けて、通知先が無関係な秘密情報を
// 読めないようにする。
export const NOTIFICATION_ENVIRONMENT_NAME_PATTERN = /^MMT_NOTIFICATION_[A-Z0-9_]+$/;
const environmentNameSchema = z.string().regex(NOTIFICATION_ENVIRONMENT_NAME_PATTERN).max(200);
// ルールは多くの実験に絞り込めるが、フィルタは一覧ではない。
const MAX_FILTER_EXPERIMENTS = 100;
// 送信の記録は最近の履歴を見るためのもので、書き出しではない。
const MAX_DELIVERY_PAGE_SIZE = 200;
const DEFAULT_DELIVERY_PAGE_SIZE = 50;

const channelNameSchema = z.string().trim().min(1).max(100);
const recipientsSchema = z.array(z.email().max(320)).max(NOTIFICATION_RECIPIENTS_MAX);
const eventTypeSchema = z.enum(NOTIFICATION_EVENT_TYPES as [string, ...string[]]);

export const notificationChannelCreateSchema = z.strictObject({
  projectId: uuidSchema.nullable().optional(),
  kind: z.enum(['slack_webhook', 'webhook', 'email']),
  name: channelNameSchema,
  urlEnv: environmentNameSchema.nullable().optional(),
  secretEnv: environmentNameSchema.nullable().optional(),
  recipients: recipientsSchema.optional(),
  enabled: z.boolean().optional(),
});
export const notificationChannelPatchSchema = notificationChannelCreateSchema
  .omit({ projectId: true, kind: true })
  .partial();

export const notificationRuleFilterSchema = z.strictObject({
  runKinds: z.array(runKindSchema).min(1).max(5).optional(),
  experimentIds: z.array(uuidSchema).min(1).max(MAX_FILTER_EXPERIMENTS).optional(),
  automationOnly: z.boolean().optional(),
});
export const notificationRuleCreateSchema = z.strictObject({
  channelId: uuidSchema,
  eventTypes: z
    .array(eventTypeSchema)
    .min(1)
    .max(NOTIFICATION_EVENT_TYPES.length)
    .refine((types) => new Set(types).size === types.length),
  filter: notificationRuleFilterSchema.optional(),
  enabled: z.boolean().optional(),
});
export const notificationRulePatchSchema = z.strictObject({ enabled: z.boolean() });
export const notificationDeliveryQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_DELIVERY_PAGE_SIZE)
    .default(DEFAULT_DELIVERY_PAGE_SIZE),
});

export type NotificationChannelCreateInput = z.infer<typeof notificationChannelCreateSchema>;
export type NotificationChannelPatchInput = z.infer<typeof notificationChannelPatchSchema>;
export type NotificationRuleCreateInput = z.infer<typeof notificationRuleCreateSchema>;
