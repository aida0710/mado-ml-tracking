import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { PluginCreate, PluginPatch } from '@mmt/contracts';
import {
  datasetVersionSchema,
  itemsOf,
  pluginAvailabilitySchema,
  pluginConnectionSchema,
  pluginDatasetSchema,
  pluginEventRetryResultSchema,
  pluginMetricsResponseSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

const pluginPath = (projectId: string, id?: string) =>
  `${projectPath(projectId)}/plugins${id ? `/${encodeId(id)}` : ''}`;

export const pluginsApi = {
  connections: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(pluginPath(projectId), { schema: itemsOf(pluginConnectionSchema), init: { signal } })).items,
  availability: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${pluginPath(projectId)}/availability`, {
        schema: itemsOf(pluginAvailabilitySchema),
        init: { signal },
      })
    ).items,
  create: (projectId: string, body: PluginCreate) =>
    requestJson(pluginPath(projectId), { schema: pluginConnectionSchema, init: jsonRequestInit('POST', body) }),
  update: (projectId: string, id: string, body: PluginPatch) =>
    requestJson(pluginPath(projectId, id), { schema: pluginConnectionSchema, init: jsonRequestInit('PATCH', body) }),
  check: (projectId: string, id: string) =>
    requestJson(`${pluginPath(projectId, id)}/check`, { schema: pluginConnectionSchema, init: { method: 'POST' } }),
  metrics: async (projectId: string, id: string, signal?: AbortSignal) =>
    (
      await requestJson(`${pluginPath(projectId, id)}/metrics`, {
        schema: pluginMetricsResponseSchema,
        init: { signal },
      })
    ).prometheus,
  searchDatasets: async (
    projectId: string,
    id: string,
    search: { query: string; expectedRevision: number },
  ) =>
    (
      await requestJson(`${pluginPath(projectId, id)}/datasets/search`, {
        schema: itemsOf(pluginDatasetSchema),
        init: jsonRequestInit('POST', search),
      })
    ).items,
  importDataset: (
    projectId: string,
    id: string,
    source: { externalId: string; expectedRevision: number },
  ) =>
    requestJson(`${pluginPath(projectId, id)}/datasets/import`, {
      schema: datasetVersionSchema,
      init: jsonRequestInit('POST', source),
    }),
  retryEvents: (projectId: string, id: string) =>
    requestJson(`${pluginPath(projectId, id)}/events/retry`, {
      schema: pluginEventRetryResultSchema,
      init: { method: 'POST' },
    }),
};
