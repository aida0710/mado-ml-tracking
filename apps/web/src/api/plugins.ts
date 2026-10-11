import type {
  DatasetVersion,
  PluginAvailability,
  PluginConnection,
  PluginCreate,
  PluginDataset,
  PluginManifest,
  PluginPatch,
} from '@mmt/contracts';
import { encodeId, invalidResponseError, jsonRequest, projectPath, request, requestItems } from './http';

const pluginPath = (projectId: string, id?: string) =>
  `${projectPath(projectId)}/plugins${id ? `/${encodeId(id)}` : ''}`;

export const pluginsApi = {
  connections: (projectId: string, signal?: AbortSignal) =>
    requestItems<PluginConnection>(pluginPath(projectId), signal),
  availability: (projectId: string, signal?: AbortSignal) =>
    requestItems<PluginAvailability>(`${pluginPath(projectId)}/availability`, signal),
  create: (projectId: string, body: PluginCreate) =>
    request<PluginConnection>(pluginPath(projectId), jsonRequest('POST', body)),
  update: (projectId: string, id: string, body: PluginPatch) =>
    request<PluginConnection>(pluginPath(projectId, id), jsonRequest('PATCH', body)),
  check: (projectId: string, id: string) =>
    request<PluginManifest>(`${pluginPath(projectId, id)}/check`, { method: 'POST' }),
  metrics: async (projectId: string, id: string, signal?: AbortSignal) => {
    const payload = await request<{ prometheus: string }>(`${pluginPath(projectId, id)}/metrics`, { signal });
    if (typeof payload.prometheus !== 'string') throw invalidResponseError();
    return payload.prometheus;
  },
  searchDatasets: async (
    projectId: string,
    id: string,
    search: { query: string; expectedRevision: number },
  ) => {
    const payload = await request<{ items: PluginDataset[] }>(
      `${pluginPath(projectId, id)}/datasets/search`,
      jsonRequest('POST', search),
    );
    if (!Array.isArray(payload.items)) throw invalidResponseError();
    return payload.items;
  },
  importDataset: (
    projectId: string,
    id: string,
    source: { externalId: string; expectedRevision: number },
  ) => request<DatasetVersion>(`${pluginPath(projectId, id)}/datasets/import`, jsonRequest('POST', source)),
  retryEvents: (projectId: string, id: string) =>
    request<{ queued: number }>(`${pluginPath(projectId, id)}/events/retry`, { method: 'POST' }),
  completeMigration: (projectId: string, id: string, expectedRevision: number) =>
    request<PluginConnection>(`${pluginPath(projectId, id)}/migration/complete`, jsonRequest('POST', { expectedRevision })),
};
