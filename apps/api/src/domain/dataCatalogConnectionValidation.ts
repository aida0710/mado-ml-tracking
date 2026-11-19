import { z } from 'zod';

// 運用者が渡す接続先と認証情報で生じる処理量を抑える。
const MAX_URL_LENGTH = 2000;
const MAX_ACCESS_TOKEN_LENGTH = 8192;

const dataCatalogUrlSchema = z
  .url()
  .max(MAX_URL_LENGTH)
  .refine((value) => {
    // URLとして読めない値は、上のz.url()がもう断っている。
    if (!URL.canParse(value)) return true;
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, 'An HTTP URL without credentials, query or fragment is required')
  .transform((value) => value.replace(/\/$/, ''));

export const dataCatalogConnectionInputSchema = z.strictObject({
  url: dataCatalogUrlSchema.describe(
    'mado S3 Data Catalogの画面のURL。APIは同じURLの下（/api/mado/）を呼ぶ。',
  ),
  accessToken: z
    .string()
    .min(1)
    .max(MAX_ACCESS_TOKEN_LENGTH)
    .refine((value) => !/[\r\n]/.test(value))
    .optional()
    .describe('省略すると、同じURLの保存済みのaccess tokenで接続を確かめ直す。'),
});
