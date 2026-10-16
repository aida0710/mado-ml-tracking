import {
  GLOBAL_TOKEN_SCOPES,
  TOKEN_SCOPE_REQUIRED_ROLE,
  TOKEN_SCOPES,
  type ProjectRole,
  type TokenScope,
} from '@mmt/contracts';

// Same ranking as the API's domain/projectRoles.ts.
const PROJECT_ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, admin: 3 };

/**
 * Scopes a token owner with this role may receive on a Project token; the API refuses the others.
 * Global scopes are left out: only a global administrator's token without a Project holds them.
 */
export function scopesAllowedForRole(role: ProjectRole): TokenScope[] {
  return TOKEN_SCOPES.filter(
    (scope) =>
      !GLOBAL_TOKEN_SCOPES.includes(scope) &&
      PROJECT_ROLE_RANK[role] >= PROJECT_ROLE_RANK[TOKEN_SCOPE_REQUIRED_ROLE[scope]],
  );
}
