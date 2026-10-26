import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { SavedViewCreate, SavedViewPage, SavedViewPatch } from '@mmt/contracts';
import { itemsOf, savedViewSchema } from '@mmt/contracts/schemas';
import { z } from 'zod';
import { encodeId, projectPath } from './http';

const savedViewsPath = (projectId: string) => `${projectPath(projectId)}/saved-views`;
const savedViewPath = (projectId: string, viewId: string) =>
  `${savedViewsPath(projectId)}/${encodeId(viewId)}`;

export const savedViewsApi = {
  /** 呼んだ人のprivateのビューと、その画面の共有されたすべてのビュー。 */
  list: async (projectId: string, page: SavedViewPage, signal?: AbortSignal) =>
    (
      await requestJson(`${savedViewsPath(projectId)}?${new URLSearchParams({ page })}`, {
        schema: itemsOf(savedViewSchema),
        init: { signal },
      })
    ).items,
  get: (projectId: string, viewId: string, signal?: AbortSignal) =>
    requestJson(savedViewPath(projectId, viewId), { schema: savedViewSchema, init: { signal } }),
  create: (projectId: string, body: SavedViewCreate) =>
    requestJson(savedViewsPath(projectId), { schema: savedViewSchema, init: jsonRequestInit('POST', body) }),
  update: (projectId: string, viewId: string, body: SavedViewPatch) =>
    requestJson(savedViewPath(projectId, viewId), { schema: savedViewSchema, init: jsonRequestInit('PATCH', body) }),
  remove: (projectId: string, viewId: string) =>
    requestJson(savedViewPath(projectId, viewId), { schema: z.undefined(), init: { method: 'DELETE' } }),
};
