import type {
  DirectorySuggestions,
  StorageBackend,
  StorageBackendChoices,
  StorageBackendCreate,
  StorageBackendPatch,
  StorageSettings,
  StorageTestResult,
} from '@mmt/contracts';
import { encodeId, invalidResponseError, jsonRequest, request, requestItems } from './http';

const backendPath = (name?: string) =>
  `/admin/storage-backends${name === undefined ? '' : `/${encodeId(name)}`}`;

export const storageApi = {
  /** Projectが使える保存先の名前。ログインしている人なら誰でも読める。 */
  choices: async (signal?: AbortSignal) => {
    const payload = await request<StorageBackendChoices>('/storage/backends', { signal });
    if (!Array.isArray(payload.items) || typeof payload.defaultBackend !== 'string')
      throw invalidResponseError();
    return payload;
  },
  backends: (signal?: AbortSignal) => requestItems<StorageBackend>(backendPath(), signal),
  createBackend: (body: StorageBackendCreate) =>
    request<StorageBackend>(backendPath(), jsonRequest('POST', body)),
  updateBackend: (name: string, body: StorageBackendPatch) =>
    request<StorageBackend>(backendPath(name), jsonRequest('PATCH', body)),
  testBackend: async (name: string) => {
    const payload = await request<StorageTestResult>(`${backendPath(name)}/test`, {
      method: 'POST',
    });
    if (!Array.isArray(payload.steps)) throw invalidResponseError();
    return payload;
  },
  settings: (signal?: AbortSignal) =>
    request<StorageSettings>('/admin/storage-settings', { signal }),
  updateSettings: (body: StorageSettings) =>
    request<StorageSettings>('/admin/storage-settings', jsonRequest('PUT', body)),
  /** filesystemの保存先のルートのパスを、入力に続けて補完するAPIサーバー上のディレクトリ。 */
  directorySuggestions: async (path: string, signal?: AbortSignal) => {
    const payload = await request<DirectorySuggestions>(
      `/admin/storage-directories?${new URLSearchParams({ path })}`,
      { signal },
    );
    if (!Array.isArray(payload.items) || typeof payload.resolvedPath !== 'string')
      throw invalidResponseError();
    return payload;
  },
};
