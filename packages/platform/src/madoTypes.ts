import { z } from 'zod';
import type { MadoAccessTokenGrant } from '@mmt/contracts';

// 信頼できないRegistryのフィールドとコレクションを、HTTPの応答のバイト数の上限とは別に制限する。
const MAX_IDENTITY_LENGTH = 512;
const MAX_URI_LENGTH = 4000;
const MAX_DIGEST_LENGTH = 1000;
const MAX_VERSION_LOCATION_COUNT = 1000;
const MAX_DATASET_VERSION_COUNT = 1000;
// mado S3 Data Catalogのカタログは、1ページに最大100件のデータセットまでしか許さない。
const MAX_CATALOG_PAGE_SIZE = 100;
// mado S3 Data Catalogは1つのaccess tokenにnamespaceを最大128個まで許す。scopeは短い固定の一覧。
const MAX_TOKEN_NAMESPACE_COUNT = 128;
const MAX_TOKEN_SCOPE_COUNT = 16;

const identitySchema = z.string().min(1).max(MAX_IDENTITY_LENGTH);
/**
 * `GET /api/mado/access-token`: 呼び出したtoken自身の権限。mado S3 Data Catalogはほかのtokenを
 * 一覧にしない。token IDのような未知のフィールドは捨て、これらのフィールドだけを保存する。
 */
export const madoAccessTokenGrantSchema: z.ZodType<MadoAccessTokenGrant> = z.object({
  name: z.string().max(MAX_IDENTITY_LENGTH),
  scopes: z.array(identitySchema).max(MAX_TOKEN_SCOPE_COUNT),
  namespaces: z.array(identitySchema).max(MAX_TOKEN_NAMESPACE_COUNT),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});
const uriSchema = z
  .string()
  .min(1)
  .max(MAX_URI_LENGTH)
  .refine((value) => {
    try {
      const uri = new URL(value);
      return (
        ['s3:', 'file:', 'https:', 'http:', 'artifact:', 'mmt:'].includes(uri.protocol) &&
        !uri.username &&
        !uri.password
      );
    } catch {
      return false;
    }
  });
export const madoVersionSchema = z.object({
  id: z.uuid(),
  datasetId: z.uuid(),
  version: identitySchema,
  contentHash: z.string().min(1).max(MAX_DIGEST_LENGTH).nullable(),
  manifestHash: z.string().min(1).max(MAX_DIGEST_LENGTH).nullable(),
  manifestUri: uriSchema.nullable(),
  schemaUri: uriSchema.nullable(),
  locations: z
    .array(
      z.object({
        uri: uriSchema,
        storageKind: z.string(),
        status: z.string(),
        isPrimary: z.boolean(),
      }),
    )
    .max(MAX_VERSION_LOCATION_COUNT),
});
export const madoDatasetSchema = z.object({
  datasetId: z.uuid(),
  namespace: identitySchema,
  name: identitySchema,
  versions: z.array(madoVersionSchema).max(MAX_DATASET_VERSION_COUNT),
});
export const madoCatalogSchema = z.object({
  results: z
    .array(
      z.object({
        datasetId: z.uuid().nullable(),
        namespace: identitySchema,
        name: identitySchema,
        currentVersionId: z.uuid().nullable(),
      }),
    )
    .max(MAX_CATALOG_PAGE_SIZE),
  totalCount: z.number().int().nonnegative(),
});
export const madoVersionDetailSchema = madoVersionSchema.extend({
  namespace: identitySchema,
  name: identitySchema,
});
export type MadoVersion = z.infer<typeof madoVersionSchema>;
export type MadoDataset = z.infer<typeof madoDatasetSchema>;
export type MadoVersionDetail = z.infer<typeof madoVersionDetailSchema>;
/**
 * mado S3 Data Catalogの1つのaccess tokenで、データセットを読み、Runの記録を送り、許されて
 * いれば容量を読む。
 */
export interface MadoCredentials {
  accessToken?: string;
}
