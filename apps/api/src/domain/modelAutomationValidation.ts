import { z } from 'zod';
import { DomainError } from './errors.js';
import {
  gpuIdsSchema,
  jsonObjectSchema,
  maxAttemptsSchema,
  modelFamiliesSchema,
  nameSchema,
  tagsSchema,
  uniqueIdsSchema,
  uuidSchema,
} from './validation.js';

// migration 034のCHECKと合わせる。これより多い項目の要約は、表の1行に収まらない。
export const MAX_SUMMARY_METRICS = 20;
// モデルバージョンの画面は実行をページ単位で求める。既定値は以前の固定の件数のまま。
export const DEFAULT_AUTOMATION_EXECUTION_LIMIT = 100;
// 自動の再試行はGPUの時間を使うので、ルールが再試行するのはmaxAttemptsを明示したときだけ。
export const DEFAULT_AUTOMATION_MAX_ATTEMPTS = 1;
export const MAX_AUTOMATION_EXECUTION_LIMIT = 200;

const summaryMetricsSchema = z
  .array(nameSchema)
  .max(MAX_SUMMARY_METRICS)
  .refine((metrics) => new Set(metrics).size === metrics.length, 'metrics must be unique');

export const modelAutomationRuleSchema = z.strictObject({
  name: nameSchema,
  enabled: z.boolean().default(true),
  modelFamilies: modelFamiliesSchema,
  kind: z.enum(['inference', 'evaluation', 'processing']),
  trigger: z.enum(['model_registered', 'upstream_run_finished']).default('model_registered'),
  upstreamRuleId: uuidSchema.nullish().transform((id) => id ?? null),
  experimentId: uuidSchema,
  codeVersionId: uuidSchema,
  targetId: uuidSchema,
  gpuIds: gpuIdsSchema.default([]),
  inputDatasetVersionIds: uniqueIdsSchema.default([]),
  parameters: jsonObjectSchema.default({}),
  tags: tagsSchema.default({}),
  maxAttempts: maxAttemptsSchema.removeDefault().default(DEFAULT_AUTOMATION_MAX_ATTEMPTS),
  summaryMetrics: summaryMetricsSchema.default([]),
});

export const modelAutomationToggleSchema = z.strictObject({
  enabled: z.boolean(),
});

export const automationRuleOwnerSchema = z.strictObject({
  serviceAccountId: uuidSchema,
});

export const automationExecutionCreateSchema = z.union([
  z.strictObject({ modelVersionId: uuidSchema }),
  z.strictObject({ triggerRunId: uuidSchema }),
]);

export const automationExecutionQuerySchema = z.strictObject({
  modelVersionId: uuidSchema.optional(),
  ruleId: uuidSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_AUTOMATION_EXECUTION_LIMIT)
    .default(DEFAULT_AUTOMATION_EXECUTION_LIMIT),
  // 保留中の行はmd5から作ったidを持ち、RFC 4122のどのバージョンにも当たらないので、
  // どんなGUIDも受け付ける。
  cursor: z.guid().optional(),
});

export type ModelAutomationRuleCreate = z.infer<typeof modelAutomationRuleSchema>;
export type AutomationExecutionCreate = z.infer<typeof automationExecutionCreateSchema>;
export type AutomationExecutionQuery = z.infer<typeof automationExecutionQuerySchema>;

// 連鎖するルールには前段のルールが要る。登録をきっかけにするルールは前段のルールを指定しない。
export function assertRuleTrigger(
  rule: Pick<ModelAutomationRuleCreate, 'trigger' | 'upstreamRuleId'>,
): void {
  if ((rule.trigger === 'upstream_run_finished') !== (rule.upstreamRuleId !== null))
    throw new DomainError({
      status: 422,
      code: 'invalid_automation_trigger',
      message: 'upstreamRuleId is required when trigger is upstream_run_finished, and only then',
    });
}
