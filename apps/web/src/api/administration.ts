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
   * One Project the user may open. A Project that cannot be opened fails with the reason; an
   * archived one answers 404 project_archived to its members and global administrators.
   */
  project: (id: string, signal?: AbortSignal) => request<Project>(projectPath(id), { signal }),
  createProject: (body: ProjectCreate) => request<Project>('/projects', jsonRequest('POST', body)),
  updateProject: (id: string, body: ProjectPatch) =>
    request<Project>(projectPath(id), jsonRequest('PATCH', body)),
  /** Hides the Project and keeps its data; a global administrator can restore it. */
  archiveProject: (id: string) =>
    request<void>(`${projectPath(id)}/archive`, { method: 'POST' }),
  tokens: (signal?: AbortSignal) => requestItems<TokenSummary>('/tokens', signal),
  createToken: (body: CreateToken) =>
    request<{ token: string; item: TokenSummary }>('/tokens', jsonRequest('POST', body)),
  revokeToken: (id: string) => request<unknown>(`/tokens/${encodeId(id)}`, { method: 'DELETE' }),
};
