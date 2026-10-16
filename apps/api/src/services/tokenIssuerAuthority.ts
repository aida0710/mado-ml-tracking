import { GLOBAL_TOKEN_SCOPES, type TokenScope } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { DomainError } from '../domain/errors.js';
import { holdsScope } from './accessService.js';

/** What a token holds: the token being issued, or the one being revoked. */
export interface TokenGrant {
  scopes: readonly string[];
  projectId: string | null;
  // ISO 8601, as tokens are stored and returned; null never expires.
  expiresAt: string | null;
}

function expiryTime(expiresAt: string | null): number {
  return expiresAt === null ? Number.POSITIVE_INFINITY : Date.parse(expiresAt);
}

/**
 * A token that issues or revokes tokens stays within its own grant: no scope it does not hold, no
 * Project it is not bound to and no lifetime beyond its own, so a leaked token cannot outgrow
 * itself. A browser session is limited by its owner's roles instead.
 */
export function requireGrantWithinIssuer(principal: Principal, grant: TokenGrant): void {
  const issuer = principal.method === 'token' ? principal.token : null;
  if (!issuer) return;
  const beyondIssuer = grant.scopes.filter((scope) => !holdsScope(principal, scope));
  if (beyondIssuer.length)
    throw new DomainError(
      403,
      `このtokenが持たないscopeのtokenは扱えません: ${beyondIssuer.join(', ')}`,
      'scope_exceeds_issuer',
    );
  if (issuer.projectId && grant.projectId !== issuer.projectId)
    throw new DomainError(403, 'このtokenのProjectの外のtokenは扱えません', 'project_forbidden');
  if (issuer.expiresAt && expiryTime(grant.expiresAt) > expiryTime(issuer.expiresAt))
    throw new DomainError(
      403,
      'このtokenより後まで有効なtokenは扱えません。有効期限をこのtokenの期限以前にしてください',
      'token_outlives_issuer',
    );
}

/**
 * Global scopes act on the whole server, so only a global administrator's token without a Project
 * restriction may hold them.
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
  throw new DomainError(
    422,
    `${globalScopes.join(', ')}は、全体管理者がProjectを指定せずに発行するtokenだけが持てます`,
    'global_scope_requires_unrestricted_token',
  );
}
