import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { AdminUserCreate, AdminUserPatch, AdminUserQuery } from '@mmt/contracts';
import { adminUserPasswordResetSchema, adminUserSchema, itemsOf } from '@mmt/contracts/schemas';
import { encodeId } from './http';

const userPath = (userId?: string) =>
  `/api/admin/users${userId === undefined ? '' : `/${encodeId(userId)}`}`;

function searchParameters(query: AdminUserQuery): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) parameters.set(key, value);
  const encoded = parameters.toString();
  return encoded ? `?${encoded}` : '';
}

/** 全体管理者のユーザー管理（/admin/users）。 */
export const adminUsersApi = {
  list: async (query: AdminUserQuery, signal?: AbortSignal) =>
    (
      await requestJson(`${userPath()}${searchParameters(query)}`, {
        schema: itemsOf(adminUserSchema),
        init: { signal },
      })
    ).items,
  create: (body: AdminUserCreate) =>
    requestJson(userPath(), { schema: adminUserSchema, init: jsonRequestInit('POST', body) }),
  update: (userId: string, body: AdminUserPatch) =>
    requestJson(userPath(userId), { schema: adminUserSchema, init: jsonRequestInit('PATCH', body) }),
  resetPassword: (userId: string) =>
    requestJson(`${userPath(userId)}/reset-password`, {
      schema: adminUserPasswordResetSchema,
      init: { method: 'POST' },
    }),
};
