import { z } from 'zod';
import { nameSchema } from './validation.js';

// これらのエンティティを作ったときのnamedEntitySchemaと同じ上限。
const descriptionSchema = z.string().max(20000);

function requireSomeField(input: object): boolean {
  return Object.values(input).some((value) => value !== undefined);
}
const EMPTY_PATCH_MESSAGE = 'specify at least one field to change';

// 名前とfamilyは変えない。MLflowのクライアントと自動実行ルールは、これで登録モデルを探す。
export const modelPatchSchema = z
  .strictObject({ description: descriptionSchema.optional() })
  .refine(requireSomeField, EMPTY_PATCH_MESSAGE);
export type ModelPatch = z.infer<typeof modelPatchSchema>;

export const experimentPatchSchema = z
  .strictObject({ name: nameSchema.optional(), description: descriptionSchema.optional() })
  .refine(requireSomeField, EMPTY_PATCH_MESSAGE);
export type ExperimentPatch = z.infer<typeof experimentPatchSchema>;

export const datasetPatchSchema = z
  .strictObject({ archived: z.boolean().optional(), description: descriptionSchema.optional() })
  .refine(requireSomeField, EMPTY_PATCH_MESSAGE);
export type DatasetPatch = z.infer<typeof datasetPatchSchema>;

// 省くとすべてのデータセットを返す。データセットの画面は、求められたときにその一覧から
// アーカイブしたものを出す。
export const datasetListQuerySchema = z.strictObject({
  archived: z.enum(['true', 'false']).optional(),
});
export type DatasetListQuery = z.infer<typeof datasetListQuerySchema>;
