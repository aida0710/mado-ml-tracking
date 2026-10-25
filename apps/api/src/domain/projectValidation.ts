import { z } from 'zod';
import type { ProjectVisibility } from '@mmt/contracts';
import { artifactBackendSchema, nameSchema, roleSchema, uuidSchema } from './validation.js';

// 作成のダイアログはメンバーを1人ずつ足す。もっと多くの人にはグループの割り当てを使う。
export const PROJECT_CREATE_MAX_MEMBERS = 100;

const PROJECT_VISIBILITIES = ['public', 'private'] as const satisfies readonly ProjectVisibility[];
const projectVisibilitySchema = z.enum(PROJECT_VISIBILITIES);
const projectDescriptionSchema = z.string().max(20000);

export const projectCreateSchema = z.strictObject({
  name: nameSchema,
  description: projectDescriptionSchema.default(''),
  artifactBackend: artifactBackendSchema.default('filesystem'),
  visibility: projectVisibilitySchema.default('public'),
  members: z
    .array(z.strictObject({ userId: uuidSchema, role: roleSchema }))
    .max(PROJECT_CREATE_MAX_MEMBERS)
    .default([]),
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

// ここでは既定値を置かない。省いた項目は値を保つ（zodはpartialの項目にも既定値を当てる）。
export const projectPatchSchema = z.strictObject({
  description: projectDescriptionSchema.optional(),
  artifactBackend: artifactBackendSchema.optional(),
  visibility: projectVisibilitySchema.optional(),
});
export type ProjectPatchInput = z.infer<typeof projectPatchSchema>;

// クエリの値は文字列。文字どおり"true"のときだけ、アーカイブしたProjectを含める。
export const adminProjectQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
