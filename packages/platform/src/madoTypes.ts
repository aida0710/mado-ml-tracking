import { z } from 'zod';
import type { MadoAccessTokenGrant } from '@mmt/contracts';

// 信頼できない応答のフィールドとコレクションを、HTTPの応答のバイト数の上限とは別に制限する。
const MAX_IDENTITY_LENGTH = 512;
// mado S3 Data Catalogのscopeは短い固定の一覧。
const MAX_TOKEN_SCOPE_COUNT = 16;

const identitySchema = z.string().min(1).max(MAX_IDENTITY_LENGTH);
/**
 * `GET /api/mado/access-token`: 呼び出したtoken自身の権限。mado S3 Data Catalogはほかのtokenを
 * 一覧にしない。ここに挙げたフィールドだけを保存し、ほかは捨てる。token IDのほか、
 * mado S3 Data Catalog v0.5.3までが返す`namespaces`もこれに当たる。
 */
export const madoAccessTokenGrantSchema: z.ZodType<MadoAccessTokenGrant> = z.object({
  name: z.string().max(MAX_IDENTITY_LENGTH),
  scopes: z.array(identitySchema).max(MAX_TOKEN_SCOPE_COUNT),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});
/** mado S3 Data Catalogの1つのaccess tokenで、tokenの権限と、許されていれば容量を読む。 */
export interface MadoCredentials {
  accessToken?: string;
}
