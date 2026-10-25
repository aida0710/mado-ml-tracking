import type { AuthConfig } from '@mmt/contracts';

export interface LoginMethods {
  development: boolean;
  sso: { label: string; loginUrl: string } | null;
  local: boolean;
}

// developmentモードは専用のフォームだけを出す。local/oidc/hybridはサーバーのログイン方法に従う。
export function loginMethods(config: AuthConfig): LoginMethods {
  if (config.mode === 'development') return { development: true, sso: null, local: false };
  return { development: false, sso: config.methods.oidc, local: config.methods.local };
}
