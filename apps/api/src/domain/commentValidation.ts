import { z } from 'zod';
import { COMMENT_MAX_LENGTH } from '@mmt/contracts';
import { uuidSchema } from './validation.js';

const DEFAULT_COMMENT_PAGE_LIMIT = 100;
// 1ページの上限。長い議論は1回の応答でなく、何回かに分けて取る。
const MAX_COMMENT_PAGE_LIMIT = 200;

export const commentTargetTypeSchema = z.enum(['run', 'model_version', 'report']);

// 空白だけの本文は、空のコメントとして表示されてしまう。
const commentBodySchema = z
  .string()
  .max(COMMENT_MAX_LENGTH)
  .refine((body) => body.trim().length > 0);

export const commentCreateSchema = z.strictObject({
  targetType: commentTargetTypeSchema,
  targetId: uuidSchema,
  parentCommentId: uuidSchema.nullable().optional(),
  body: commentBodySchema,
});

export const commentUpdateSchema = z.strictObject({ body: commentBodySchema });

export const commentListQuerySchema = z.strictObject({
  targetType: commentTargetTypeSchema,
  targetId: uuidSchema,
  cursor: uuidSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_COMMENT_PAGE_LIMIT)
    .default(DEFAULT_COMMENT_PAGE_LIMIT),
});

export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type CommentListQuery = z.infer<typeof commentListQuerySchema>;
