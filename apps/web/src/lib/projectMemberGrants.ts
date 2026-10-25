import type { ProjectMemberGrant, ProjectRole, UserSearchResult } from '@mmt/contracts';

// Projectの作成時やメンバーの一覧から追加したメンバーはRunを記録できる。adminがメンバーごとに
// 変える。
export const DEFAULT_MEMBER_GRANT_ROLE: ProjectRole = 'editor';

/** 作成ダイアログで選んだメンバーと、その行に出す名前。 */
export interface MemberGrantDraft {
  user: UserSearchResult;
  role: ProjectRole;
}

/** `user`を既定のロールで足す。すでに一覧にいる利用者は元の行のまま。 */
export function addMemberGrant(
  drafts: MemberGrantDraft[],
  user: UserSearchResult,
): MemberGrantDraft[] {
  if (drafts.some((draft) => draft.user.id === user.id)) return drafts;
  return [...drafts, { user, role: DEFAULT_MEMBER_GRANT_ROLE }];
}

export function changeMemberGrantRole(
  drafts: MemberGrantDraft[],
  { userId, role }: { userId: string; role: ProjectRole },
): MemberGrantDraft[] {
  return drafts.map((draft) => (draft.user.id === userId ? { ...draft, role } : draft));
}

export function removeMemberGrant(drafts: MemberGrantDraft[], userId: string): MemberGrantDraft[] {
  return drafts.filter((draft) => draft.user.id !== userId);
}

/** POST /projectsが受け取る付与。 */
export function toProjectMemberGrants(drafts: MemberGrantDraft[]): ProjectMemberGrant[] {
  return drafts.map(({ user, role }) => ({ userId: user.id, role }));
}
