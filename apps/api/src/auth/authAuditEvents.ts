import type { RequestMetadata } from '../http/requestMetadata.js';

// auth.loginイベントの共通の項目。detailsにはパスワード、コード、stateの値を入れない。
export function loginAudit(method: 'local' | 'oidc' | 'development', metadata: RequestMetadata) {
  return {
    action: 'auth.login',
    resourceType: 'user',
    details: { method },
    ...metadata,
  };
}
