import {
  GLOBAL_TOKEN_SCOPES,
  TOKEN_SCOPE_REQUIRED_ROLE,
  TOKEN_SCOPES,
  type ProjectRole,
  type TokenScope,
} from '@mmt/contracts';

// APIのdomain/projectRoles.tsと同じ順位付け。
const PROJECT_ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, admin: 3 };

/**
 * このロールのtokenの持ち主が、Projectのtokenで受け取れるscope。それ以外はAPIが拒否する。
 * 全体のscopeは除く。それを持てるのは、全体管理者の、Projectを持たないtokenだけ。
 */
export function scopesAllowedForRole(role: ProjectRole): TokenScope[] {
  return TOKEN_SCOPES.filter(
    (scope) =>
      !GLOBAL_TOKEN_SCOPES.includes(scope) &&
      PROJECT_ROLE_RANK[role] >= PROJECT_ROLE_RANK[TOKEN_SCOPE_REQUIRED_ROLE[scope]],
  );
}
