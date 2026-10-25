import type { ProjectMember, ProjectRole } from '@mmt/contracts';

/** メンバーのProjectのロールの出どころ。直接の付与か、Authentikのグループへの付与。 */
export type ProjectMemberSource =
  | { kind: 'direct'; role: ProjectRole }
  | { kind: 'group'; group: string; role: ProjectRole };

/** 直接の付与を先に、グループへの付与を名前の順に並べ、同じメンバーがいつも同じに読めるようにする。 */
export function listProjectMemberSources(member: ProjectMember): ProjectMemberSource[] {
  const groupSources = [...member.groups]
    .sort((left, right) => left.group.localeCompare(right.group))
    .map(({ group, role }): ProjectMemberSource => ({ kind: 'group', group, role }));
  return member.directRole === null
    ? groupSources
    : [{ kind: 'direct', role: member.directRole }, ...groupSources];
}

/**
 * この画面で編集・削除できるのは直接の付与だけ。グループだけでロールを持つメンバーは、グループへの
 * 付与かAuthentikでの所属が変わるまで、そのロールを持ち続ける。
 */
export function hasDirectGrant(member: ProjectMember): boolean {
  return member.directRole !== null;
}
