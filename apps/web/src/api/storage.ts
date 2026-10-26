import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { StorageBackendCreate, StorageBackendPatch, StorageSettings } from '@mmt/contracts';
import {
  directorySuggestionsSchema,
  itemsOf,
  storageBackendChoicesSchema,
  storageBackendSchema,
  storageSettingsSchema,
  storageTestResultSchema,
} from '@mmt/contracts/schemas';
import { encodeId } from './http';

const backendPath = (name?: string) =>
  `/api/admin/storage-backends${name === undefined ? '' : `/${encodeId(name)}`}`;

export const storageApi = {
  /** Projectが使える保存先の名前。ログインしている人なら誰でも読める。 */
  choices: (signal?: AbortSignal) =>
    requestJson('/api/storage/backends', { schema: storageBackendChoicesSchema, init: { signal } }),
  backends: async (signal?: AbortSignal) =>
    (await requestJson(backendPath(), { schema: itemsOf(storageBackendSchema), init: { signal } })).items,
  createBackend: (body: StorageBackendCreate) =>
    requestJson(backendPath(), { schema: storageBackendSchema, init: jsonRequestInit('POST', body) }),
  updateBackend: (name: string, body: StorageBackendPatch) =>
    requestJson(backendPath(name), { schema: storageBackendSchema, init: jsonRequestInit('PATCH', body) }),
  testBackend: (name: string) =>
    requestJson(`${backendPath(name)}/test`, { schema: storageTestResultSchema, init: { method: 'POST' } }),
  settings: (signal?: AbortSignal) =>
    requestJson('/api/admin/storage-settings', { schema: storageSettingsSchema, init: { signal } }),
  updateSettings: (body: StorageSettings) =>
    requestJson('/api/admin/storage-settings', { schema: storageSettingsSchema, init: jsonRequestInit('PUT', body) }),
  /** filesystemの保存先のルートのパスを、入力に続けて補完するAPIサーバー上のディレクトリ。 */
  directorySuggestions: (path: string, signal?: AbortSignal) =>
    requestJson(`/api/admin/storage-directories?${new URLSearchParams({ path })}`, {
      schema: directorySuggestionsSchema,
      init: { signal },
    }),
};
