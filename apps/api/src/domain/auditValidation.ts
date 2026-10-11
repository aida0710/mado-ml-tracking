import { z } from 'zod';
import { uuidSchema } from './validation.js';

const DEFAULT_AUDIT_EVENT_LIMIT = 50;
// Bounds one page so a global administrator cannot request the whole unbounded log at once.
const MAX_AUDIT_EVENT_LIMIT = 200;

/**
 * Sign-ins, sign-outs and the identity provider's syncs and rechecks: written on every session, so
 * they bury the changes people look for. hideSignIns=true leaves them out.
 */
export const SIGN_IN_AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.oidc.sync',
  'auth.oidc.recheck',
] as const;

const projectAuditEventQueryFields = {
  action: z.string().min(1).max(200).optional(),
  // Query values are strings; only the literal "true" hides them.
  hideSignIns: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  actorUserId: uuidSchema.optional(),
  outcome: z.enum(['success', 'denied', 'failed']).optional(),
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
