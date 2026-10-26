import { requestJson } from '@mado/design-system/http';
import type { AdminProjectQuery } from '@mmt/contracts';
import { adminProjectSchema, itemsOf } from '@mmt/contracts/schemas';
import { z } from 'zod';
import { encodeId } from './http';

const adminProjectPath = (projectId?: string) =>
  `/api/admin/projects${projectId === undefined ? '' : `/${encodeId(projectId)}`}`;

/** 全体管理者のProjectの一覧と、アーカイブしたProjectを元に戻す・完全に削除する操作。 */
export const adminProjectsApi = {
  list: async ({ includeArchived }: AdminProjectQuery, signal?: AbortSignal) =>
    (
      await requestJson(`${adminProjectPath()}${includeArchived ? '?includeArchived=true' : ''}`, {
        schema: itemsOf(adminProjectSchema),
        init: { signal },
      })
    ).items,
  restore: (projectId: string) =>
    requestJson(`${adminProjectPath(projectId)}/restore`, { schema: adminProjectSchema, init: { method: 'POST' } }),
  /** アーカイブしたProjectを、Artifactのファイルを含むすべてのデータごと消す。 */
  purge: (projectId: string) =>
    requestJson(adminProjectPath(projectId), { schema: z.undefined(), init: { method: 'DELETE' } }),
};
