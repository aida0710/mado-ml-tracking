import type { AdminUser } from '@mmt/contracts';

// The API returns at most this many users per list (ADMIN_USER_LIST_LIMIT in
// apps/api/src/domain/adminUserValidation.ts); a full page may have left some out.
export const ADMIN_USER_LIST_LIMIT = 500;

/**
 * The one active global administrator, whom the API refuses to disable or demote (409), so the
 * screen can say so before the click. `activePeople` are the active people (not Service
 * Accounts). Null when there are several, or when the list may be cut and so cannot tell.
 */
export function findLastActiveGlobalAdminId(
  activePeople: readonly AdminUser[] | undefined,
): string | null {
  if (!activePeople || activePeople.length >= ADMIN_USER_LIST_LIMIT) return null;
  const admins = activePeople.filter((user) => user.isAdmin && user.status === 'active');
  return admins.length === 1 ? admins[0]!.id : null;
}
