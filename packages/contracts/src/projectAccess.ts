import type { ProjectRole, User } from './index.js';

/** Authentikのgroupに入っている全員に付与するProjectのrole（project_group_bindings）。 */
export interface ProjectGroupBinding {
  projectId: string;
  group: string;
  role: ProjectRole;
  createdBy: string | null;
  createdAt: string;
}

/** メンバーがProjectのroleを持つ元になっているgroupの1つ。 */
export interface ProjectMemberGroupRole {
  group: string;
  role: ProjectRole;
}

/**
 * Projectのroleを持つユーザー。`role`は実効role。直接付与（`directRole`。無ければnull）と、
 * `groups`にあるgroupへの付与のroleのうち、最も高いもの。
 */
export interface ProjectMember {
  user: User;
  role: ProjectRole;
  directRole: ProjectRole | null;
  groups: ProjectMemberGroupRole[];
}

/** GET /users?query=で見つかったユーザー。ユーザーを選ぶのに要る項目だけを持つ。 */
export interface UserSearchResult {
  id: string;
  email: string;
  displayName: string;
}
