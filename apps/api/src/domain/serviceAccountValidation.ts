import { z } from 'zod';
import { nameSchema, roleSchema, uniqueScopesSchema } from './validation.js';

const descriptionSchema = z.string().max(2000);

export const serviceAccountCreateSchema = z.strictObject({
  name: nameSchema,
  description: descriptionSchema.default(''),
  role: roleSchema,
});

export const serviceAccountUpdateSchema = z
  .strictObject({
    description: descriptionSchema.optional(),
    role: roleSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export const serviceAccountTokenCreateSchema = z.strictObject({
  name: nameSchema,
  scopes: uniqueScopesSchema,
  expiresAt: z.iso.datetime({ offset: true }).nullish()
    .describe('未来の日時。nullは無期限。省略時は設定された既定の日数（既定365日）。'),
});
