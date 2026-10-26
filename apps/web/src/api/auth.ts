import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import { authConfigSchema, authMeSchema, devLoginResultSchema } from '@mmt/contracts/schemas';
import { z } from 'zod';

export const authApi = {
  config: (signal?: AbortSignal) => requestJson('/api/auth/config', { schema: authConfigSchema, init: { signal } }),
  me: (signal?: AbortSignal) => requestJson('/api/auth/me', { schema: authMeSchema, init: { signal } }),
  devLogin: (email: string, displayName: string) =>
    requestJson('/api/auth/dev-login', {
      schema: devLoginResultSchema,
      init: jsonRequestInit('POST', { email, displayName }),
    }),
  localLogin: (credentials: { username: string; password: string }) =>
    requestJson('/api/auth/local-login', { schema: authMeSchema, init: jsonRequestInit('POST', credentials) }),
  changePassword: (passwords: { currentPassword: string; newPassword: string }) =>
    requestJson('/api/auth/change-password', { schema: z.undefined(), init: jsonRequestInit('POST', passwords) }),
  logout: () => requestJson('/api/auth/logout', { schema: z.undefined(), init: { method: 'POST' } }),
};
