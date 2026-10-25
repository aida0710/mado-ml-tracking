import type { Account } from '@mmt/contracts';
import { invalidResponseError, request } from './http';

/** ログインしている本人のプロフィール（/account）。 */
export const accountApi = {
  get: async (signal?: AbortSignal) => {
    const payload = await request<Account>('/account', { signal });
    if (!payload.user || !Array.isArray(payload.groups)) throw invalidResponseError();
    return payload;
  },
};
