import type { UserSearchResult } from '@mmt/contracts';

/** ユーザーの表示名と、その下のメールアドレス。検索結果と選んだメンバーに出す。 */
export function UserSummary({ user }: { user: Pick<UserSearchResult, 'displayName' | 'email'> }) {
  return (
    <span className="user-summary">
      <span>{user.displayName}</span>
      <span className="muted">{user.email}</span>
    </span>
  );
}
