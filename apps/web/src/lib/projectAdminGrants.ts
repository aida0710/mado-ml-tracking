import type { ProjectMember } from '@mmt/contracts';

// APIのadminの不変条件（domain/projectAdminInvariant.ts）に合わせ、設定画面で最後のadminを
// 下げたり外したりする操作を出さない。人が使える付与だけを数える。直接のadminか、誰かが入って
// いるグループへのadminの付与。判断の正本はAPIのまま。

/** Projectを管理できる状態を保つadminの付与。 */
export type ProjectAdminGrant =
  | { kind: 'member'; userId: string }
  | { kind: 'groupBinding'; group: string };

function people(members: readonly ProjectMember[]): ProjectMember[] {
  return members.filter((member) => member.user.kind === 'human');
}

/**
 * 1人以上が入っている、付与のあるグループ。メンバーの一覧には付与が届く全員が入るので、ここに
 * 無い付与のあるグループは、まだ誰もそのグループでログインしていない。
 */
export function groupsWithMembers(members: readonly ProjectMember[]): Set<string> {
  return new Set(people(members).flatMap((member) => member.groups.map(({ group }) => group)));
}

export function listProjectAdminGrants(members: readonly ProjectMember[]): ProjectAdminGrant[] {
  const directAdmins = people(members)
    .filter((member) => member.directRole === 'admin')
    .map((member): ProjectAdminGrant => ({ kind: 'member', userId: member.user.id }));
  const adminGroups = new Set(
    people(members).flatMap((member) =>
      member.groups.filter(({ role }) => role === 'admin').map(({ group }) => group),
    ),
  );
  return [
    ...directAdmins,
    ...[...adminGroups].map((group): ProjectAdminGrant => ({ kind: 'groupBinding', group })),
  ];
}

/** 残っている唯一のadminの付与で、外せないもの。2つ以上（または0）のあいだはnull。 */
export function findLastProjectAdminGrant(
  members: readonly ProjectMember[],
): ProjectAdminGrant | null {
  const [onlyGrant, ...otherGrants] = listProjectAdminGrants(members);
  return onlyGrant && otherGrants.length === 0 ? onlyGrant : null;
}

/** Project adminである人（直接またはグループ経由）の表示名。名前の順。 */
export function projectAdminNames(members: readonly ProjectMember[]): string[] {
  return people(members)
    .filter((member) => member.role === 'admin')
    .map((member) => member.user.displayName)
    .sort((left, right) => left.localeCompare(right, 'ja'));
}
