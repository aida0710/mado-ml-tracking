import { z } from 'zod';
import { validateEarlyStoppingConfig } from './sweeps/hyperband.js';
import { validateSearchSpace } from './sweeps/searchSpace.js';
import type { EarlyStoppingConfig, SearchSpace } from './sweeps/types.js';
import { gpuIdsSchema, nameSchema, uuidSchema } from './validation.js';

// API契約の上限。これより大きいSweepは分けた方がよく、これより多い並列のtrialは、どのみち
// どのComputeTargetのmax_concurrent_jobsも超える。
export const MAX_SWEEP_TRIALS = 10000;
export const MAX_SWEEP_PARALLELISM = 100;
const DEFAULT_SWEEP_PARALLELISM = 1;
// 候補を出すPRNG（mulberry32）は32ビットの状態を持つ。
export const MAX_SWEEP_SEED = 4294967295;
// MLflowのメトリクスのキーと同じ上限。
const MAX_OBJECTIVE_METRIC_LENGTH = 250;
// Runのparameterのキーと同じ上限（jsonObjectSchema）。
const MAX_PARAMETER_NAME_LENGTH = 200;
// カテゴリの文字列はRunのparameterの値になり、MLflowはその値を6000文字までに制限している。
const MAX_PARAMETER_STRING_LENGTH = 6000;
const DEFAULT_SWEEP_PAGE_LIMIT = 50;
const MAX_SWEEP_PAGE_LIMIT = 200;
const DEFAULT_TRIAL_PAGE_LIMIT = 100;
// 一般的なグリッドのSweepが1ページに収まり、それでいて10000 trialの応答にはならない大きさ。
const MAX_TRIAL_PAGE_LIMIT = 500;

const parameterValueSchema = z.union([
  z.string().max(MAX_PARAMETER_STRING_LENGTH),
  z.number(),
  z.boolean(),
]);

// 構造だけを見る。範囲・重複・グリッドの上限はvalidateSearchSpaceが検査し、そのメッセージで
// 問題のparameterを名指しする。
const parameterDefinitionSchema = z.union([
  z.strictObject({ values: z.array(parameterValueSchema) }),
  z.strictObject({ value: parameterValueSchema }),
  z.strictObject({
    distribution: z.enum(['uniform', 'log_uniform', 'int_uniform', 'q_uniform']),
    min: z.number(),
    max: z.number(),
    q: z.number().optional(),
  }),
]);

const earlyStoppingSchema = z.strictObject({
  type: z.literal('hyperband'),
  minIter: z.number(),
  eta: z.number(),
  maxIter: z.number().optional(),
});

const sweepMethodSchema = z.enum(['grid', 'random', 'bayes']);
const maxTrialsSchema = z.number().int().min(1).max(MAX_SWEEP_TRIALS);
const parallelismSchema = z.number().int().min(1).max(MAX_SWEEP_PARALLELISM);

export const sweepCreateSchema = z.strictObject({
  name: nameSchema,
  taskId: uuidSchema,
  method: sweepMethodSchema,
  searchSpace: z.record(
    z.string().min(1).max(MAX_PARAMETER_NAME_LENGTH),
    parameterDefinitionSchema,
  ),
  objective: z.strictObject({
    metric: z.string().trim().min(1).max(MAX_OBJECTIVE_METRIC_LENGTH),
    goal: z.enum(['minimize', 'maximize']),
    aggregation: z.enum(['last', 'min', 'max']).default('last'),
  }),
  maxTrials: maxTrialsSchema,
  parallelism: parallelismSchema.default(DEFAULT_SWEEP_PARALLELISM),
  earlyStopping: earlyStoppingSchema.nullable().default(null),
  seed: z.number().int().min(0).max(MAX_SWEEP_SEED).optional(),
  targetId: uuidSchema.nullable().default(null),
  gpuIds: gpuIdsSchema.nullable().default(null),
});

export const sweepPatchSchema = z
  .strictObject({ maxTrials: maxTrialsSchema.optional(), parallelism: parallelismSchema.optional() })
  .refine((patch) => patch.maxTrials !== undefined || patch.parallelism !== undefined, {
    message: 'Specify maxTrials or parallelism',
  });

export const sweepCancelSchema = z.strictObject({
  cancelRunningTrials: z.boolean().default(false),
});

export const sweepListQuerySchema = z.strictObject({
  status: z.enum(['running', 'paused', 'finished', 'canceled', 'failed']).optional(),
  cursor: uuidSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_SWEEP_PAGE_LIMIT)
    .default(DEFAULT_SWEEP_PAGE_LIMIT),
});

export const sweepTrialQuerySchema = z.strictObject({
  orderBy: z.enum(['trial_index', 'objective']).default('trial_index'),
  cursor: uuidSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TRIAL_PAGE_LIMIT)
    .default(DEFAULT_TRIAL_PAGE_LIMIT),
});

export type SweepCreateInput = z.infer<typeof sweepCreateSchema>;
export type SweepPatchInput = z.infer<typeof sweepPatchSchema>;
export type SweepCancelInput = z.infer<typeof sweepCancelSchema>;
export type SweepListQuery = z.infer<typeof sweepListQuerySchema>;
export type SweepTrialQuery = z.infer<typeof sweepTrialQuerySchema>;

/** 探索の定義の意味の検査（422 sweep_space_invalid / sweep_early_terminate_invalid）。 */
export function validateSweepDefinition(input: SweepCreateInput): void {
  validateSearchSpace(input.searchSpace as SearchSpace, input.method);
  if (input.earlyStopping) validateEarlyStoppingConfig(input.earlyStopping as EarlyStoppingConfig);
}
