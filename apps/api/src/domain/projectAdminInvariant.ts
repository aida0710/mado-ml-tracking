import type { ProjectRole } from '@mmt/contracts';
import { conflict } from './errors.js';

// Projectには、人が使えるadminの付与が少なくとも1つ必要。直接のadminのメンバーか、誰かが
// 入っているグループ（user_groups）のadminの割り当て。まだ誰もそのグループでログインしていない
// 割り当ては数えない。数えると、グループ名を打ち間違えたときに最後の実際のadminが抜けられて
// しまい、Projectを管理し直せるのは全体管理者だけになる。

export interface ProjectAdminGrants {
  directAdminUserIds: readonly string[];
  /** 少なくとも1人が入っているグループのadminの割り当て。空のグループは除く。 */
  heldAdminGroupNames: readonly string[];
}

// roleは変更後の値。nullは付与を外す。
export type ProjectAdminChange =
  | { kind: 'member'; userId: string; role: ProjectRole | null }
  | { kind: 'group_binding'; groupName: string; role: ProjectRole | null };

// 呼び出し側はProjectの行をロックしてから付与を読み、同時の削除が順に処理されるようにする。
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

// グループについての文は、一覧に残っているadminの割り当てがなぜ数えられなかったかに答える。
const EMPTY_ADMIN_GROUP_NOTE = 'admins of groups that nobody has joined yet are not counted';

/** Projectにadminがいなくなるメンバーや割り当ての変更を拒む（409）。 */
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
