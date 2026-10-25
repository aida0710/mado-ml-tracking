import { z } from 'zod';
import { uuidSchema } from './validation.js';

const DEFAULT_AUDIT_EVENT_LIMIT = 50;
// 1ページの上限。全体管理者でも、際限のないログ全体を一度に求められないようにする。
const MAX_AUDIT_EVENT_LIMIT = 200;

/**
 * サインイン、サインアウト、IdPとの同期と再確認。sessionのたびに書かれるので、利用者が探したい
 * 変更を埋もれさせる。hideSignIns=trueで除く。
 */
export const SIGN_IN_AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.oidc.sync',
  'auth.oidc.recheck',
] as const;

const projectAuditEventQueryFields = {
  action: z.string().min(1).max(200).optional(),
  // クエリの値は文字列。文字どおり"true"のときだけ隠す。
  hideSignIns: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  actorUserId: uuidSchema.optional(),
  outcome: z.enum(['success', 'denied', 'failure']).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_AUDIT_EVENT_LIMIT)
    .default(DEFAULT_AUDIT_EVENT_LIMIT),
  cursor: uuidSchema.optional(),
};

export const projectAuditEventQuerySchema = z.strictObject(projectAuditEventQueryFields);
export const auditEventQuerySchema = z.strictObject({
  ...projectAuditEventQueryFields,
  projectId: uuidSchema.optional(),
});

export type ProjectAuditEventQuery = z.infer<typeof projectAuditEventQuerySchema>;
export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;
