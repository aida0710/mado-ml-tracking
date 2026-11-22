import { z } from 'zod';

// S3のバケット名は63文字まで。S3互換のストレージの長い名前も通るよう、余裕を持たせる。
const MAX_BUCKET_LENGTH = 255;
const storageConnectionIdSchema = z.string().min(1).max(512);

/**
 * POST /projects/:p/data-catalog/storage-connection-reassignments。付け替える先を一覧と照合する
 * のはサービス。`from`は一覧に無いID（作り直す前の接続）でもよい。
 */
export const storageConnectionReassignmentSchema = z
  .strictObject({
    bucket: z.string().min(1).max(MAX_BUCKET_LENGTH).optional(),
    fromDataCatalogStorageConnectionId: storageConnectionIdSchema.nullable(),
    toDataCatalogStorageConnectionId: storageConnectionIdSchema.nullable(),
  })
  .refine(
    (reassignment) =>
      reassignment.bucket !== undefined || reassignment.fromDataCatalogStorageConnectionId !== null,
    // 未設定のバージョンへ付けるのは、人が選んだバケットの分だけにする。
    { path: ['bucket'], message: 'bucket is required to set a storage connection on versions without one' },
  )
  .refine(
    (reassignment) =>
      reassignment.fromDataCatalogStorageConnectionId !==
      reassignment.toDataCatalogStorageConnectionId,
    { path: ['toDataCatalogStorageConnectionId'], message: 'the storage connection does not change' },
  );

export type StorageConnectionReassignmentInput = z.infer<typeof storageConnectionReassignmentSchema>;
