import type { ProjectMemberGrant, User } from '@mmt/contracts';
import { DomainError, notFound } from './errors.js';

export type GrantableUserState = Pick<User, 'id' | 'kind' | 'status'>;

/**
 * Projectを作るときに足すメンバー。同じ利用者が2回あればリクエストを拒む。作成者は常に
 * Project adminなので除く。
 */
export function initialMemberGrants(
  grants: readonly ProjectMemberGrant[],
  creatorId: string,
): ProjectMemberGrant[] {
  const listed = new Set<string>();
  for (const { userId } of grants) {
    const key = userId.toLowerCase();
    if (listed.has(key))
      throw new DomainError({
        status: 400,
        code: 'duplicate_project_member',
        message: 'the same user is specified twice',
      });
    listed.add(key);
  }
  return grants.filter((grant) => grant.userId.toLowerCase() !== creatorId.toLowerCase());
}

/**
 * すべての付与が有効な人を指していなければ、リクエスト全体を拒む。Service Accountは
 * アカウント自体にroleを持ち、launcherはメンバーにならない。
 */
export function assertGrantableUsers(
  grants: readonly ProjectMemberGrant[],
  users: readonly GrantableUserState[],
): void {
  const usersById = new Map(users.map((user) => [user.id.toLowerCase(), user]));
  for (const { userId } of grants) {
    const user = usersById.get(userId.toLowerCase());
    if (!user) notFound('user');
    if (user.kind !== 'human' || user.status !== 'active')
      throw new DomainError({
        status: 400,
        code: 'invalid_project_member',
        message: 'only active users can be added as members',
      });
  }
}
