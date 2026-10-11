import { z } from 'zod';
import type { MadoPluginConfig } from '@mmt/contracts';
import {
  madoCatalogSchema,
  madoDatasetSchema,
  madoVersionDetailSchema,
  type MadoCredentials,
} from './madoTypes.js';

// Bound both transfer time and response size; an unavailable catalog cannot occupy a worker forever.
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
  async function requestText(
    url: URL,
    token: string | undefined,
    payload?: string,
  ): Promise<string> {
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
      return schema.parse(JSON.parse(await requestText(url, credentials.readToken)));
    } catch (error) {
      if (error instanceof MadoApiError) throw error;
      throw new MadoApiError(502);
    }
  }
  function assertNamespace(namespace: string): void {
    if (!config.namespaces.includes(namespace)) throw new MadoApiError(403);
  }
  return {
    async catalog(namespace: string, query: string) {
      assertNamespace(namespace);
      const url = new URL('api/mado/lineage/catalog', readOrigin);
      url.search = new URLSearchParams({
        namespace,
        q: query,
        limit: String(SEARCH_PAGE_SIZE),
        offset: '0',
      }).toString();
      const catalog = await readJson(url, madoCatalogSchema);
      if (catalog.results.some((dataset) => dataset.namespace !== namespace))
        throw new MadoApiError(502);
      return catalog;
    },
    async dataset(id: string) {
      if (!z.uuid().safeParse(id).success) throw new MadoApiError(400);
      const dataset = await readJson(
        new URL(`api/mado/lineage/datasets/${id}`, readOrigin),
        madoDatasetSchema,
      );
      assertNamespace(dataset.namespace);
      if (dataset.datasetId !== id || dataset.versions.some((version) => version.datasetId !== id))
        throw new MadoApiError(502);
      return dataset;
    },
    async version(id: string) {
      if (!z.uuid().safeParse(id).success) throw new MadoApiError(400);
      const version = await readJson(
        new URL(`api/mado/lineage/versions/${id}`, readOrigin),
        madoVersionDetailSchema,
      );
      assertNamespace(version.namespace);
      if (version.id !== id) throw new MadoApiError(502);
      return version;
    },
    async sendLineage(payload: string): Promise<void> {
      let acknowledgment: unknown;
      try {
        acknowledgment = JSON.parse(
          await requestText(
            new URL('api/openlineage/v1/lineage', lineageOrigin),
            credentials.lineageToken,
            payload,
          ),
        );
      } catch (error) {
        if (error instanceof MadoApiError) throw error;
        throw new MadoApiError(502);
      }
      if (!z.object({ accepted: z.literal(true) }).safeParse(acknowledgment).success)
        throw new MadoApiError(502);
    },
    capacityMetrics: () =>
      requestText(new URL('api/mado/metrics/capacity', readOrigin), credentials.metricsToken),
  };
}
export type MadoClient = ReturnType<typeof createMadoClient>;
export type { MadoCredentials, MadoVersion, MadoDataset, MadoVersionDetail } from './madoTypes.js';
