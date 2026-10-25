import { ANALYSIS_MAX_METRICS, ANALYSIS_MAX_PARAMS } from '@mmt/contracts';
import { z } from 'zod';
import { runSearchSchema } from '../routes/runSearchRoutes.js';
import { uuidSchema } from './validation.js';

// MLflowはメトリクスのkeyを250文字まで受け付け、ネイティブのメトリクス名より長い。
const MAX_METRIC_KEY_LENGTH = 250;
// MLflowのparameterのkeyも250文字まで。
const MAX_PARAM_KEY_LENGTH = 250;

const uniqueKeys = (keyLength: number) =>
  z
    .array(z.string().min(1).max(keyLength))
    .refine((keys) => new Set(keys).size === keys.length, 'keys must be unique');

/**
 * ここではrunIdsの要素数に上限を置かない。ANALYSIS_MAX_RUNSを超えたら、条件に合うRunが多すぎる
 * 検索やSweepと同じ422 too_many_runsを返す。パースの量はJSONの本文の上限で抑える。
 */
const runSetSchema = z.union([
  z.strictObject({
    runIds: z
      .array(uuidSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, 'runIds must be unique'),
  }),
  // 分析では条件に合うRunをすべて読むので、ページ送りの条件は使わない。
  z.strictObject({ search: runSearchSchema.omit({ limit: true, cursor: true }) }),
  z.strictObject({ sweepId: uuidSchema }),
]);

const paramsSchema = uniqueKeys(MAX_PARAM_KEY_LENGTH).min(1).max(ANALYSIS_MAX_PARAMS).optional();

export const runAnalysisTableRequestSchema = z.strictObject({
  runSet: runSetSchema,
  params: paramsSchema,
  metrics: uniqueKeys(MAX_METRIC_KEY_LENGTH).min(1).max(ANALYSIS_MAX_METRICS),
});

export const parameterImportanceRequestSchema = z.strictObject({
  runSet: runSetSchema,
  targetMetric: z.string().min(1).max(MAX_METRIC_KEY_LENGTH).optional(),
  params: paramsSchema,
});

export type RunSetQuery = z.infer<typeof runSetSchema>;
export type RunAnalysisTableQuery = z.infer<typeof runAnalysisTableRequestSchema>;
export type ParameterImportanceQuery = z.infer<typeof parameterImportanceRequestSchema>;
