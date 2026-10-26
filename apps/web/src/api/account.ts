import { requestJson } from '@mado/design-system/http';
import { accountSchema } from '@mmt/contracts/schemas';

/** ログインしている本人のプロフィール（/account）。 */
export const accountApi = {
  get: (signal?: AbortSignal) => requestJson('/api/account', { schema: accountSchema, init: { signal } }),
};
