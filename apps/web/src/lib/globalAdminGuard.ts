import type { AdminUser } from '@mmt/contracts';

// APIが1回の一覧で返すユーザーはこの数まで（apps/api/src/domain/adminUserValidation.tsの
// ADMIN_USER_LIST_LIMIT）。満杯のページでは、漏れたユーザーがいるかもしれない。
export const ADMIN_USER_LIST_LIMIT = 500;

/**
 * 有効な全体管理者が1人だけのときの、その人。APIはこの人の無効化や権限の取り下げを断る（409）ので、
 * 押す前に画面でそう伝えられる。`activePeople`は有効な人（Service Accountを除く）。複数いる
 * ときや、一覧が切れているかもしれず判断できないときはnull。
 */
export function findLastActiveGlobalAdminId(
  activePeople: readonly AdminUser[] | undefined,
): string | null {
  if (!activePeople || activePeople.length >= ADMIN_USER_LIST_LIMIT) return null;
  const admins = activePeople.filter((user) => user.isAdmin && user.status === 'active');
  return admins.length === 1 ? admins[0]!.id : null;
}
