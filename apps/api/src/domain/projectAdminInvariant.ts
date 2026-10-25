import type { ProjectRole } from '@mmt/contracts';
import { conflict } from './errors.js';

// A Project must keep at least one admin grant that a person can use: a direct admin member or
// an admin binding of a group someone is in (user_groups). A binding of a group nobody has logged
// in with yet does not count, because a mistyped group name would otherwise let the last real
// admin leave and only a global administrator could manage the Project again.

export interface ProjectAdminGrants {
  directAdminUserIds: readonly string[];
  /** Admin bindings of groups that at least one person is in; empty groups are left out. */
  heldAdminGroupNames: readonly string[];
}

// role is the value after the change; null removes the grant.
export type ProjectAdminChange =
  | { kind: 'member'; userId: string; role: ProjectRole | null }
  | { kind: 'group_binding'; groupName: string; role: ProjectRole | null };

// The caller reads grants after locking the Project row so concurrent removals serialize.
export function removesLastProjectAdmin(
  grants: ProjectAdminGrants,
  change: ProjectAdminChange,
): boolean {
  if (change.role === 'admin') return false;
  const directAdmins = grants.directAdminUserIds.filter(
    (userId) => !(change.kind === 'member' && userId === change.userId),
  );
  const adminGroups = grants.heldAdminGroupNames.filter(
    (groupName) => !(change.kind === 'group_binding' && groupName === change.groupName),
  );
  const removesAGrant =
    directAdmins.length !== grants.directAdminUserIds.length ||
    adminGroups.length !== grants.heldAdminGroupNames.length;
  return removesAGrant && directAdmins.length + adminGroups.length === 0;
}

// The group sentence answers why an admin binding that is still listed did not count.
const EMPTY_ADMIN_GROUP_NOTE = 'admins of groups that nobody has joined yet are not counted';

/** Refuses (409) a member or binding change that would leave the Project without an admin. */
export function assertKeepsProjectAdmin(
  grants: ProjectAdminGrants,
  change: ProjectAdminChange,
): void {
  if (!removesLastProjectAdmin(grants, change)) return;
  conflict(
    change.role === null
      ? `the last project admin cannot be removed; ${EMPTY_ADMIN_GROUP_NOTE}`
      : `the role of the last project admin cannot be lowered; ${EMPTY_ADMIN_GROUP_NOTE}`,
  );
}
