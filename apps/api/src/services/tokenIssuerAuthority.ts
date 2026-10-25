import { GLOBAL_TOKEN_SCOPES, type TokenScope } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { DomainError } from '../domain/errors.js';
import { holdsScope } from './accessService.js';

/** tokenが持つもの。対象は、発行しようとしているtokenか、失効させようとしているtoken。 */
export interface TokenGrant {
  scopes: readonly string[];
  projectId: string | null;
  // tokenの保存・応答と同じくISO 8601。nullなら期限切れにならない。
  expiresAt: string | null;
}

function expiryTime(expiresAt: string | null): number {
  return expiresAt === null ? Number.POSITIVE_INFINITY : Date.parse(expiresAt);
}

/**
 * tokenを発行・失効させるtokenは、自分に許された範囲を超えない。自分が持たないscope、自分が
 * 結びついていないProject、自分より長い有効期間は扱えないので、漏れたtokenが自分より強いものを
 * 作ることはできない。ブラウザのsessionは、代わりにその持ち主のroleで制限される。
 */
export function requireGrantWithinIssuer(principal: Principal, grant: TokenGrant): void {
  const issuer = principal.method === 'token' ? principal.token : null;
  if (!issuer) return;
  const beyondIssuer = grant.scopes.filter((scope) => !holdsScope(principal, scope));
  if (beyondIssuer.length)
    throw new DomainError({
      status: 403,
      code: 'token_authority_exceeded',
      message: `tokens with scopes this token does not have cannot be managed: ${beyondIssuer.join(', ')}`,
      details: { scopes: beyondIssuer },
    });
  if (issuer.projectId && grant.projectId !== issuer.projectId)
    throw new DomainError({
      status: 403,
      code: 'project_forbidden',
      message: 'tokens outside the project of this token cannot be managed',
    });
  if (issuer.expiresAt && expiryTime(grant.expiresAt) > expiryTime(issuer.expiresAt))
    throw new DomainError({
      status: 403,
      code: 'token_outlives_issuer',
      message: 'tokens valid longer than this token cannot be managed; set the expiry no later than that of this token',
    });
}

/**
 * 全体のscopeはサーバー全体に作用するので、それを持てるのは、Projectの制限が無い全体管理者の
 * tokenだけ。
 */
export function requireGlobalScopesUnrestricted(grant: {
  scopes: readonly string[];
  projectId: string | null;
  ownerIsAdmin: boolean;
}): void {
  const globalScopes = grant.scopes.filter((scope) =>
    GLOBAL_TOKEN_SCOPES.includes(scope as TokenScope),
  );
  if (!globalScopes.length || (grant.projectId === null && grant.ownerIsAdmin)) return;
  throw new DomainError({
    status: 422,
    code: 'global_scope_requires_unrestricted_token',
    message: `${globalScopes.join(', ')} can be held only by tokens a global administrator issues without a project`,
    details: { scopes: globalScopes },
  });
}
