import { z } from 'zod';
import {
  allowsAllMadoNamespaces,
  allowsMadoNamespace,
  isSameUuid,
  type MadoAccessTokenGrant,
  type MadoPluginConfig,
} from '@mmt/contracts';
import {
  madoAccessTokenGrantSchema,
  madoCatalogSchema,
  madoDatasetSchema,
  madoVersionDetailSchema,
  type MadoCredentials,
} from './madoTypes.js';

// 転送時間と応答のサイズの両方を制限する。使えないカタログがworkerをいつまでも占有できない
// ようにする。
const MADO_REQUEST_DEADLINE_MS = 8000;
const MADO_RESPONSE_LIMIT_BYTES = 4 * 1024 * 1024;
const SEARCH_PAGE_SIZE = 50;
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
  const readOrigin = baseUrl(config.apiUrl);
  const lineageOrigin = baseUrl(config.lineageUrl);
  async function requestText(url: URL, payload?: string): Promise<string> {
    const token = credentials.accessToken;
    if (!token) throw new MadoApiError(503);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: url.pathname.endsWith('/metrics/capacity') ? 'text/plain' : 'application/json',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: payload }),
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
  // 1つのclientは1つの操作に使うので、mado S3 Data Catalogで変えた権限は次の操作から効く。
  let grantRequest: Promise<MadoAccessTokenGrant> | null = null;
  function accessTokenGrant(): Promise<MadoAccessTokenGrant> {
    grantRequest ??= readJson(
      new URL('api/mado/access-token', readOrigin),
      madoAccessTokenGrantSchema,
    );
    return grantRequest;
  }
  async function assertNamespace(namespace: string): Promise<void> {
    if (!allowsMadoNamespace(await accessTokenGrant(), namespace)) throw new MadoApiError(403);
  }
  return {
    accessTokenGrant,
    /** `namespace: null`はすべてのnamespaceを検索し、そのすべてを許すtokenが要る。 */
    async catalog(namespace: string | null, query: string) {
      const grant = await accessTokenGrant();
      const isAllowed =
        namespace === null ? allowsAllMadoNamespaces(grant) : allowsMadoNamespace(grant, namespace);
      if (!isAllowed) throw new MadoApiError(403);
      // mado S3 Data Catalogは、指定したnamespaceの中か、すべてを検索するときは権限の範囲の中で
      // 答える。
      const isRequested = (candidate: string) =>
        namespace === null ? allowsMadoNamespace(grant, candidate) : candidate === namespace;
      const url = new URL('api/mado/lineage/catalog', readOrigin);
      url.search = new URLSearchParams({
        ...(namespace === null ? {} : { namespace }),
        q: query,
        limit: String(SEARCH_PAGE_SIZE),
        offset: '0',
      }).toString();
      const catalog = await readJson(url, madoCatalogSchema);
      if (catalog.results.some((dataset) => !isRequested(dataset.namespace)))
        throw new MadoApiError(502);
      return catalog;
    },
    async dataset(id: string) {
      if (!z.uuid().safeParse(id).success) throw new MadoApiError(400);
      const dataset = await readJson(
        new URL(`api/mado/lineage/datasets/${id}`, readOrigin),
        madoDatasetSchema,
      );
      await assertNamespace(dataset.namespace);
      if (
        !isSameUuid(id, dataset.datasetId) ||
        dataset.versions.some((version) => !isSameUuid(id, version.datasetId))
      )
        throw new MadoApiError(502);
      return dataset;
    },
    async version(id: string) {
      if (!z.uuid().safeParse(id).success) throw new MadoApiError(400);
      const version = await readJson(
        new URL(`api/mado/lineage/versions/${id}`, readOrigin),
        madoVersionDetailSchema,
      );
      await assertNamespace(version.namespace);
      if (!isSameUuid(id, version.id)) throw new MadoApiError(502);
      return version;
    },
    async sendLineage(payload: string): Promise<void> {
      let acknowledgment: unknown;
      try {
        acknowledgment = JSON.parse(
          await requestText(new URL('api/openlineage/v1/lineage', lineageOrigin), payload),
        );
      } catch (error) {
        if (error instanceof MadoApiError) throw error;
        throw new MadoApiError(502);
      }
      if (!z.object({ accepted: z.literal(true) }).safeParse(acknowledgment).success)
        throw new MadoApiError(502);
    },
    capacityMetrics: () => requestText(new URL('api/mado/metrics/capacity', readOrigin)),
  };
}
export type MadoClient = ReturnType<typeof createMadoClient>;
export type { MadoCredentials, MadoVersion, MadoDataset, MadoVersionDetail } from './madoTypes.js';
