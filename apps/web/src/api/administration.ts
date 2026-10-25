import type {
  Project,
  ProjectCreate,
  ProjectPatch,
  TokenSummary,
} from '@mmt/contracts';
import type { CreateToken } from './inputs';
import {
  encodeId,
  jsonRequest,
  projectPath,
  request,
  requestItems,
} from './http';

export const administrationApi = {
  projects: (signal?: AbortSignal) => requestItems<Project>('/projects', signal),
  /**
   * 利用者が開けるProjectを1つ読む。開けないProjectは理由つきで失敗する。アーカイブしたProjectは、
   * そのメンバーと全体管理者に404 project_archivedを返す。
   */
  project: (id: string, signal?: AbortSignal) => request<Project>(projectPath(id), { signal }),
  createProject: (body: ProjectCreate) => request<Project>('/projects', jsonRequest('POST', body)),
  updateProject: (id: string, body: ProjectPatch) =>
    request<Project>(projectPath(id), jsonRequest('PATCH', body)),
  /** Projectを隠し、データは残す。全体管理者が元に戻せる。 */
  archiveProject: (id: string) =>
    request<void>(`${projectPath(id)}/archive`, { method: 'POST' }),
  tokens: (signal?: AbortSignal) => requestItems<TokenSummary>('/tokens', signal),
  createToken: (body: CreateToken) =>
    request<{ token: string; item: TokenSummary }>('/tokens', jsonRequest('POST', body)),
  revokeToken: (id: string) => request<unknown>(`/tokens/${encodeId(id)}`, { method: 'DELETE' }),
};
