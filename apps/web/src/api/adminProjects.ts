import type { AdminProject, AdminProjectQuery } from '@mmt/contracts';
import { encodeId, request, requestItems } from './http';

const adminProjectPath = (projectId?: string) =>
  `/admin/projects${projectId === undefined ? '' : `/${encodeId(projectId)}`}`;

/** 全体管理者のProjectの一覧と、アーカイブしたProjectを元に戻す・完全に削除する操作。 */
export const adminProjectsApi = {
  list: ({ includeArchived }: AdminProjectQuery, signal?: AbortSignal) =>
    requestItems<AdminProject>(
      `${adminProjectPath()}${includeArchived ? '?includeArchived=true' : ''}`,
      signal,
    ),
  restore: (projectId: string) =>
    request<AdminProject>(`${adminProjectPath(projectId)}/restore`, { method: 'POST' }),
  /** アーカイブしたProjectを、Artifactのファイルを含むすべてのデータごと消す。 */
  purge: (projectId: string) =>
    request<void>(adminProjectPath(projectId), { method: 'DELETE' }),
};
