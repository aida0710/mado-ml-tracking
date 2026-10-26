import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { ProjectCreate, ProjectPatch } from '@mmt/contracts';
import { issuedTokenSchema, itemsOf, projectSchema, tokenSummarySchema } from '@mmt/contracts/schemas';
import { z } from 'zod';
import type { CreateToken } from './inputs';
import { encodeId, projectPath } from './http';

export const administrationApi = {
  projects: async (signal?: AbortSignal) =>
    (await requestJson('/api/projects', { schema: itemsOf(projectSchema), init: { signal } })).items,
  /**
   * 利用者が開けるProjectを1つ読む。開けないProjectは理由つきで失敗する。アーカイブしたProjectは、
   * そのメンバーと全体管理者に404 project_archivedを返す。
   */
  project: (id: string, signal?: AbortSignal) =>
    requestJson(projectPath(id), { schema: projectSchema, init: { signal } }),
  createProject: (body: ProjectCreate) =>
    requestJson('/api/projects', { schema: projectSchema, init: jsonRequestInit('POST', body) }),
  updateProject: (id: string, body: ProjectPatch) =>
    requestJson(projectPath(id), { schema: projectSchema, init: jsonRequestInit('PATCH', body) }),
  /** Projectを隠し、データは残す。全体管理者が元に戻せる。 */
  archiveProject: (id: string) =>
    requestJson(`${projectPath(id)}/archive`, { schema: z.undefined(), init: { method: 'POST' } }),
  tokens: async (signal?: AbortSignal) =>
    (await requestJson('/api/tokens', { schema: itemsOf(tokenSummarySchema), init: { signal } })).items,
  createToken: (body: CreateToken) =>
    requestJson('/api/tokens', { schema: issuedTokenSchema, init: jsonRequestInit('POST', body) }),
  revokeToken: (id: string) =>
    requestJson(`/api/tokens/${encodeId(id)}`, { schema: z.undefined(), init: { method: 'DELETE' } }),
};
