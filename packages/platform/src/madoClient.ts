import type { z } from 'zod';
import type { MadoAccessTokenGrant, MadoPluginConfig } from '@mmt/contracts';
import { madoAccessTokenGrantSchema, type MadoCredentials } from './madoTypes.js';

// 転送時間と応答のサイズの両方を制限する。応答しないmado S3 Data Catalogがリクエストを
// いつまでも占有できないようにする。
const MADO_REQUEST_DEADLINE_MS = 8000;
const MADO_RESPONSE_LIMIT_BYTES = 4 * 1024 * 1024;
export class MadoApiError extends Error {
  constructor(readonly status: number) {
    super(`Mado API returned HTTP ${status}`);
    this.name = 'MadoApiError';
  }
}
export function createMadoClient({
  config,
  credentials,
  fetcher = fetch,
}: {
  config: MadoPluginConfig;
  credentials: MadoCredentials;
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
      throw new MadoApiError(502);
    return parsed;
  }
  const apiOrigin = baseUrl(config.apiUrl);
  async function requestText(url: URL): Promise<string> {
    const token = credentials.accessToken;
    if (!token) throw new MadoApiError(503);
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: url.pathname.endsWith('/metrics/capacity') ? 'text/plain' : 'application/json',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(MADO_REQUEST_DEADLINE_MS),
      });
    } catch {
      throw new MadoApiError(503);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new MadoApiError(response.status);
    }
    if (!response.body) throw new MadoApiError(502);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MADO_RESPONSE_LIMIT_BYTES) throw new MadoApiError(502);
        chunks.push(part.value);
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
      if (error instanceof MadoApiError) throw error;
      throw new MadoApiError(502);
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
  async function readJson<T>(url: URL, schema: z.ZodType<T>): Promise<T> {
    try {
      return schema.parse(JSON.parse(await requestText(url)));
    } catch (error) {
      if (error instanceof MadoApiError) throw error;
      throw new MadoApiError(502);
    }
  }
  return {
    accessTokenGrant: (): Promise<MadoAccessTokenGrant> =>
      readJson(new URL('api/mado/access-token', apiOrigin), madoAccessTokenGrantSchema),
    capacityMetrics: () => requestText(new URL('api/mado/metrics/capacity', apiOrigin)),
  };
}
export type { MadoCredentials } from './madoTypes.js';
