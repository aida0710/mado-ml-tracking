// アプリには、アクセスを復旧できる有効な全体管理者（ローカルかSSO）が常に1人いなければならない。

export interface GlobalAdminChange {
  userId: string;
  // 変更後の値。省いた項目はそのまま。
  isAdmin?: boolean;
  status?: 'active' | 'disabled';
}

// activeAdminIdsは、変更前に有効な全体管理者である利用者。
// 呼び出し側はロックを取って読み、同時に起きた2つの降格が両方通らないようにする。
export function removesLastGlobalAdmin(
  activeAdminIds: readonly string[],
  change: GlobalAdminChange,
): boolean {
  if (!activeAdminIds.includes(change.userId)) return false;
  const staysActiveAdmin = change.isAdmin !== false && change.status !== 'disabled';
  if (staysActiveAdmin) return false;
  return activeAdminIds.every((userId) => userId === change.userId);
}
