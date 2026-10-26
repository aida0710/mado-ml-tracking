import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type {
  ProjectRole,
  ServiceAccountCreate,
  ServiceAccountTokenCreate,
  ServiceAccountUpdate,
} from '@mmt/contracts';
import {
  authGroupListSchema,
  issuedTokenSchema,
  itemsOf,
  projectGroupBindingSchema,
  projectMemberSchema,
  serviceAccountSchema,
  tokenSummarySchema,
  userSearchResultSchema,
} from '@mmt/contracts/schemas';
import { z } from 'zod';
import { encodeId, projectPath } from './http';

const memberPath = (projectId: string, userId?: string) =>
  `${projectPath(projectId)}/members${userId ? `/${encodeId(userId)}` : ''}`;
const serviceAccountPath = (projectId: string, serviceAccountId?: string) =>
  `${projectPath(projectId)}/service-accounts${serviceAccountId ? `/${encodeId(serviceAccountId)}` : ''}`;
const groupBindingPath = (projectId: string, group?: string) =>
  `${projectPath(projectId)}/group-bindings${group ? `/${encodeId(group)}` : ''}`;

/** Projectを使える人（直接のメンバー、Authentikのgroupへの付与）と、その裏で使う検索。 */
export const accessApi = {
  members: async (projectId: string, signal?: AbortSignal) =>
    (await requestJson(memberPath(projectId), { schema: itemsOf(projectMemberSchema), init: { signal } })).items,
  saveMember: (projectId: string, userId: string, role: ProjectRole) =>
    requestJson(memberPath(projectId, userId), {
      schema: projectMemberSchema,
      init: jsonRequestInit('PUT', { role }),
    }),
  removeMember: (projectId: string, userId: string) =>
    requestJson(memberPath(projectId, userId), { schema: z.undefined(), init: { method: 'DELETE' } }),
  groupBindings: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(groupBindingPath(projectId), {
        schema: itemsOf(projectGroupBindingSchema),
        init: { signal },
      })
    ).items,
  saveGroupBinding: (projectId: string, group: string, role: ProjectRole) =>
    requestJson(groupBindingPath(projectId, group), {
      schema: projectGroupBindingSchema,
      init: jsonRequestInit('PUT', { role }),
    }),
  removeGroupBinding: (projectId: string, group: string) =>
    requestJson(groupBindingPath(projectId, group), { schema: z.undefined(), init: { method: 'DELETE' } }),
  searchUsers: async (query: string, signal?: AbortSignal) =>
    (
      await requestJson(`/api/users?${new URLSearchParams({ query })}`, {
        schema: itemsOf(userSearchResultSchema),
        init: { signal },
      })
    ).items,
  /** ユーザーにこれまで付いたことのあるgroup名。groupへの付与を足すときの候補に出す。 */
  groups: async (signal?: AbortSignal) =>
    (await requestJson('/api/auth/groups', { schema: authGroupListSchema, init: { signal } })).items,
  serviceAccounts: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(serviceAccountPath(projectId), {
        schema: itemsOf(serviceAccountSchema),
        init: { signal },
      })
    ).items,
  createServiceAccount: (projectId: string, body: ServiceAccountCreate) =>
    requestJson(serviceAccountPath(projectId), {
      schema: serviceAccountSchema,
      init: jsonRequestInit('POST', body),
    }),
  updateServiceAccount: (projectId: string, serviceAccountId: string, body: ServiceAccountUpdate) =>
    requestJson(serviceAccountPath(projectId, serviceAccountId), {
      schema: serviceAccountSchema,
      init: jsonRequestInit('PATCH', body),
    }),
  createServiceAccountToken: (
    projectId: string,
    serviceAccountId: string,
    body: ServiceAccountTokenCreate,
  ) =>
    requestJson(`${serviceAccountPath(projectId, serviceAccountId)}/tokens`, {
      schema: issuedTokenSchema,
      init: jsonRequestInit('POST', body),
    }),
  /** Projectに限定したすべてのtoken（持ち主を問わない）。値は返さない。 */
  projectTokens: async (projectId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${projectPath(projectId)}/tokens`, {
        schema: itemsOf(tokenSummarySchema),
        init: { signal },
      })
    ).items,
};
