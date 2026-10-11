import { describe, expect, it } from 'vitest';
import type { AdminUser } from '@mmt/contracts';
import { ADMIN_USER_LIST_LIMIT, findLastActiveGlobalAdminId } from './globalAdminGuard';

function user(id: string, isAdmin: boolean): AdminUser {
  return {
    id,
    email: `${id}@example.com`,
    displayName: id,
    isAdmin,
    username: id,
    status: 'active',
    authSources: ['local'],
    kind: 'human',
    lastLoginAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    serviceAccountProject: null,
  };
}

describe('最後の全体管理者', () => {
  it('有効な全体管理者が1人だけなら、その人を返す', () => {
    expect(findLastActiveGlobalAdminId([user('admin', true), user('member', false)])).toBe('admin');
  });

  it('全体管理者が2人以上なら、誰も最後ではない', () => {
    expect(findLastActiveGlobalAdminId([user('a', true), user('b', true)])).toBeNull();
  });

  it('読み込み前や、上限まで返って一覧が切れているかもしれないときは決めない', () => {
    expect(findLastActiveGlobalAdminId(undefined)).toBeNull();
    const full = [
      user('admin', true),
      ...Array.from({ length: ADMIN_USER_LIST_LIMIT - 1 }, (_, index) => user(`u${index}`, false)),
    ];
    expect(findLastActiveGlobalAdminId(full)).toBeNull();
  });
});
