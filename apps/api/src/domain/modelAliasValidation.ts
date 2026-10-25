import { z } from 'zod';
import type { ModelAliasProtection, ModelAliasProtectionRole } from '@mmt/contracts';
import { satisfiesProjectRole } from './projectRoles.js';
import { uuidSchema } from './validation.js';

// model_alias_events.reasonのCHECKと合わせ、DBより先にAPIで拒む。
export const MAX_MODEL_ALIAS_REASON_LENGTH = 2000;
const DEFAULT_MODEL_ALIAS_EVENT_LIMIT = 50;
// 履歴の1ページの上限。画面の表とSDKは、長い履歴をページ送りでたどる。
const MAX_MODEL_ALIAS_EVENT_LIMIT = 200;

const reasonSchema = z.string().max(MAX_MODEL_ALIAS_REASON_LENGTH);

export const modelAliasAssignmentSchema = z
  .strictObject({
    versionId: uuidSchema,
    reason: reasonSchema.optional(),
    evaluationId: uuidSchema.optional(),
    // Python SDK（set_model_alias(evaluation_id=)）は、根拠をaliasのイベントの項目名で送る。
    // どちらの名前も同じ昇格の判定を指す。
    promotionEvaluationId: uuidSchema.optional(),
  })
  .refine(
    (body) =>
      !body.evaluationId ||
      !body.promotionEvaluationId ||
      body.evaluationId === body.promotionEvaluationId,
    { message: 'evaluationId and promotionEvaluationId differ' },
  )
  .transform(({ promotionEvaluationId, ...body }) => ({
    ...body,
    evaluationId: body.evaluationId ?? promotionEvaluationId,
  }));

export const modelAliasRemovalSchema = z.strictObject({
  reason: reasonSchema.optional(),
});

export const modelAliasEventQuerySchema = z.strictObject({
  alias: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MODEL_ALIAS_EVENT_LIMIT)
    .default(DEFAULT_MODEL_ALIAS_EVENT_LIMIT),
  cursor: uuidSchema.optional(),
});

export const modelAliasProtectionInputSchema = z.strictObject({
  requiredRole: z.enum(['editor', 'admin']),
  requirePassedEvaluation: z.boolean().default(false),
});

export const modelAliasProtectionQuerySchema = z.strictObject({
  modelId: uuidSchema.optional(),
});

export type ModelAliasAssignment = z.infer<typeof modelAliasAssignmentSchema>;
export type ModelAliasProtectionInput = z.infer<typeof modelAliasProtectionInputSchema>;

/** 当てはまる保護をすべて合わせたうえで、1つのaliasを手で変えるときに満たすべき条件。 */
export interface EffectiveAliasProtection {
  requiredRole: ModelAliasProtectionRole;
  requirePassedEvaluation: boolean;
}

/**
 * aliasのProject全体の保護と登録モデルの保護を、設定ごとに厳しい方をとって1つにまとめる。
 * 登録モデル単位の行はProject全体の規則を厳しくできるが、緩めることはできない。
 * aliasが保護されていなければnullを返す。
 */
export function combineAliasProtections(
  protections: readonly Pick<ModelAliasProtection, 'requiredRole' | 'requirePassedEvaluation'>[],
): EffectiveAliasProtection | null {
  if (!protections.length) return null;
  return protections.reduce<EffectiveAliasProtection>(
    (strictest, protection) => ({
      requiredRole: satisfiesProjectRole(strictest.requiredRole, protection.requiredRole)
        ? strictest.requiredRole
        : protection.requiredRole,
      requirePassedEvaluation:
        strictest.requirePassedEvaluation || protection.requirePassedEvaluation,
    }),
    { requiredRole: 'editor', requirePassedEvaluation: false },
  );
}
export type ModelAliasEventQuery = z.infer<typeof modelAliasEventQuerySchema>;
