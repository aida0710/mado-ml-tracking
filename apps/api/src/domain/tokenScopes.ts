import { TOKEN_SCOPE_REQUIRED_ROLE, type ProjectRole, type TokenScope } from '@mmt/contracts';
import { satisfiesProjectRole } from './projectRoles.js';

/** 求めたscopeをすべて持てる、最も弱いProjectのrole。 */
export function requiredProjectRoleForScopes(scopes: readonly TokenScope[]): ProjectRole {
  return scopes.reduce<ProjectRole>((strongest, scope) => {
    const required = TOKEN_SCOPE_REQUIRED_ROLE[scope];
    return satisfiesProjectRole(strongest, required) ? strongest : required;
  }, 'viewer');
}

/** リクエストのscopeのうち、そのroleが持てないもの。 */
export function scopesBeyondRole(scopes: readonly TokenScope[], role: ProjectRole): TokenScope[] {
  return scopes.filter((scope) => !satisfiesProjectRole(role, TOKEN_SCOPE_REQUIRED_ROLE[scope]));
}
