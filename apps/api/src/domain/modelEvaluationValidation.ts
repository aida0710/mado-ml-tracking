import { z } from 'zod';
import { MODEL_VERSION_RESULT_RUN_KINDS } from '@mmt/contracts';
import { uuidSchema } from './validation.js';

// 1ページには、1つのバージョンの自動実行のパイプラインの結果が収まる。上限で、1回のリクエストが
// Runごとに行う自動実行の参照の数を抑える。
export const DEFAULT_RELATED_RUN_LIMIT = 50;
export const MAX_RELATED_RUN_LIMIT = 200;

const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_RELATED_RUN_LIMIT)
  .default(DEFAULT_RELATED_RUN_LIMIT);

export const modelVersionEvaluationQuerySchema = z.strictObject({
  kind: z.enum(MODEL_VERSION_RESULT_RUN_KINDS).optional(),
  limit: limitSchema,
  cursor: uuidSchema.optional(),
});

export const runDownstreamQuerySchema = z.strictObject({
  limit: limitSchema,
  cursor: uuidSchema.optional(),
});

export type ModelVersionEvaluationQuery = z.infer<typeof modelVersionEvaluationQuerySchema>;
export type RunDownstreamQuery = z.infer<typeof runDownstreamQuerySchema>;
