// IdPのグループから、SSOの利用者がログインできるかと、どの全体のroleを持つかを決める。
// Projectのroleはここでは決めない。直接の付与とProjectのグループの割り当てから決まる。
// 対応表（MMT_OIDC_ROLE_MAPPING_JSON）が空なら、IdPはログインの可否だけを決め、全体のroleは
// このアプリの全体管理で決める（mado S3 Data Catalogと同じ決まり）。

// 弱い順に並べる。対応付けた複数のグループに入っている利用者は、最も強いroleになる。
// 'admin'は全体管理者（users.is_admin）。'user'はログインだけできる。
export const GLOBAL_ROLES = ['user', 'admin'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

// user_groups.group_nameと合わせる。これより長いか空のclaimの値は、保存せずに無視する。
export const MAX_GROUP_NAME_LENGTH = 256;

export interface OidcRolePolicy {
  allowedGroups: string[];
  roleMapping: Record<string, GlobalRole>;
  defaultRole: GlobalRole;
}

// managedRoleは、IdPが全体のroleを決めるときだけ入る。無ければroleはこのアプリで管理する。
export type OidcAccess =
  | { allowed: false; groups: string[] }
  | { allowed: true; managedRole?: GlobalRole; groups: string[] };

export function isGlobalRole(value: unknown): value is GlobalRole {
  return GLOBAL_ROLES.includes(value as GlobalRole);
}

export function idpManagesGlobalRole(policy: Pick<OidcRolePolicy, 'roleMapping'>): boolean {
  return Object.keys(policy.roleMapping).length > 0;
}

function strongerRole(left: GlobalRole, right: GlobalRole): GlobalRole {
  return GLOBAL_ROLES.indexOf(left) >= GLOBAL_ROLES.indexOf(right) ? left : right;
}

// 重複を除いて並べ替え、保存するグループと監査の差分がclaimの順に左右されないようにする。
export function normalizeGroups(groups: readonly unknown[]): string[] {
  const names = groups.filter(
    (group): group is string =>
      typeof group === 'string' && group.length > 0 && group.length <= MAX_GROUP_NAME_LENGTH,
  );
  return [...new Set(names)].sort();
}

export function resolveOidcAccess(
  policy: OidcRolePolicy,
  claimGroups: readonly unknown[],
): OidcAccess {
  const groups = normalizeGroups(claimGroups);
  if (!groups.some((group) => policy.allowedGroups.includes(group)))
    return { allowed: false, groups };
  if (!idpManagesGlobalRole(policy)) return { allowed: true, groups };
  const mappedRoles = groups.flatMap((group) => {
    const role = policy.roleMapping[group];
    return role ? [role] : [];
  });
  const managedRole =
    mappedRoles.length === 0 ? policy.defaultRole : mappedRoles.reduce(strongerRole);
  return { allowed: true, managedRole, groups };
}

export interface OidcRolePolicySettings {
  // カンマ区切りのMMT_OIDC_ALLOWED_GROUPS。
  allowedGroups: string | undefined;
  // MMT_OIDC_ROLE_MAPPING_JSON: {"<group>": "<global role>"}.
  roleMappingJson: string | undefined;
  defaultRole: string | undefined;
}

function parseRoleMapping(json: string): Record<string, GlobalRole> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('MMT_OIDC_ROLE_MAPPING_JSON must be a JSON object');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('MMT_OIDC_ROLE_MAPPING_JSON must be a JSON object');
  const mapping: Record<string, GlobalRole> = {};
  for (const [group, role] of Object.entries(parsed)) {
    if (group.length === 0 || group.length > MAX_GROUP_NAME_LENGTH)
      throw new Error('MMT_OIDC_ROLE_MAPPING_JSON has an invalid group name');
    // 知らないroleがあれば起動を止める。あとで足したroleを黙って'user'として扱ってはならない。
    if (!isGlobalRole(role))
      throw new Error(`MMT_OIDC_ROLE_MAPPING_JSON roles must be one of ${GLOBAL_ROLES.join(', ')}`);
    mapping[group] = role;
  }
  return mapping;
}

// 環境変数の設定からポリシーを組み立てる。エラーには設定名だけを出し、値は出さない。
export function createOidcRolePolicy(settings: OidcRolePolicySettings): OidcRolePolicy {
  const allowedGroups = normalizeGroups(
    (settings.allowedGroups ?? '').split(',').map((group) => group.trim()),
  );
  if (allowedGroups.length === 0) throw new Error('MMT_OIDC_ALLOWED_GROUPS is required');
  const defaultRole = settings.defaultRole ?? 'user';
  if (!isGlobalRole(defaultRole))
    throw new Error(`MMT_OIDC_DEFAULT_ROLE must be one of ${GLOBAL_ROLES.join(', ')}`);
  const roleMapping = parseRoleMapping(settings.roleMappingJson ?? '{}');
  return { allowedGroups, roleMapping, defaultRole };
}
