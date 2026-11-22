import { z } from 'zod';

/**
 * PUT .../versions/:v/data-catalog-storage-connection。nullはIDを外す。保存済みの接続の一覧と
 * 照合するのはサービス。
 */
export const versionStorageConnectionUpdateSchema = z.strictObject({
  dataCatalogStorageConnectionId: z.string().min(1).max(512).nullable(),
});

export type VersionStorageConnectionUpdateInput = z.infer<
  typeof versionStorageConnectionUpdateSchema
>;
