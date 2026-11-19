import { z } from 'zod';
import type { DataCatalogAccessTokenGrant } from '@mmt/contracts';

// 転送時間と応答のサイズの両方を制限する。応答しないmado S3 Data Catalogがリクエストを
// いつまでも占有できないようにする。
const DATA_CATALOG_REQUEST_DEADLINE_MS = 8000;
const DATA_CATALOG_RESPONSE_LIMIT_BYTES = 4 * 1024 * 1024;
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
const accessTokenGrantSchema: z.ZodType<DataCatalogAccessTokenGrant> = z.object({
  name: z.string().max(MAX_IDENTITY_LENGTH),
  scopes: z.array(identitySchema).max(MAX_TOKEN_SCOPE_COUNT),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});

/** statusは、mado S3 Data Catalogが返したもの。届かなければ503、応答を読めなければ502。 */
export class DataCatalogApiError extends Error {
  constructor(readonly status: number) {
    super(`mado S3 Data Catalog returned HTTP ${status}`);
    this.name = 'DataCatalogApiError';
  }
}

/**
 * mado S3 Data Catalogを1つのaccess tokenで読む。`url`は画面のURLで、APIはその下の
 * `api/mado/`にある（mado S3 Data Catalogは画面とAPIを同じ入口で配る）。
 */
export function createDataCatalogClient({
  url,
  accessToken,
  fetcher = fetch,
}: {
  url: string;
  accessToken: string;
  fetcher?: typeof fetch;
}) {
  function baseUrl(value: string): URL {
    const parsed = new URL(value.endsWith('/') ? value : `${value}/`);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      throw new DataCatalogApiError(502);
    return parsed;
  }
  const base = baseUrl(url);
  async function requestText(endpoint: URL): Promise<string> {
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: endpoint.pathname.endsWith('/metrics/capacity')
            ? 'text/plain'
            : 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(DATA_CATALOG_REQUEST_DEADLINE_MS),
      });
    } catch {
      throw new DataCatalogApiError(503);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new DataCatalogApiError(response.status);
    }
    if (!response.body) throw new DataCatalogApiError(502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > DATA_CATALOG_RESPONSE_LIMIT_BYTES) throw new DataCatalogApiError(502);
        chunks.push(part.value);
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
      if (error instanceof DataCatalogApiError) throw error;
      throw new DataCatalogApiError(502);
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
  return {
    accessTokenGrant: async (): Promise<DataCatalogAccessTokenGrant> => {
      const body = await requestText(new URL('api/mado/access-token', base));
      try {
        return accessTokenGrantSchema.parse(JSON.parse(body));
      } catch {
        throw new DataCatalogApiError(502);
      }
    },
    capacityMetrics: () => requestText(new URL('api/mado/metrics/capacity', base)),
  };
}
export type DataCatalogClient = ReturnType<typeof createDataCatalogClient>;
