import { describe, expect, it } from 'vitest';
import type { ProjectMember, ProjectRole, UserKind } from '@mmt/contracts';
import {
  findLastProjectAdminGrant,
  groupsWithMembers,
  listProjectAdminGrants,
} from './projectAdminGrants';

function member(
  id: string,
  grants: { directRole?: ProjectRole; groups?: ProjectMember['groups']; kind?: UserKind },
): ProjectMember {
  return {
    user: {
      id,
      email: `${id}@example.com`,
      displayName: id,
      isAdmin: false,
      username: null,
      status: 'active',
      authSources: ['oidc'],
      kind: grants.kind ?? 'human',
    },
    role: grants.directRole ?? 'viewer',
    directRole: grants.directRole ?? null,
    groups: grants.groups ?? [],
  };
}

describe('Projectに残るAdmin', () => {
  it('直接付与のAdminが1人だけなら、その人が最後のAdmin', () => {
    const members = [member('lead', { directRole: 'admin' }), member('editor', { directRole: 'editor' })];
    expect(findLastProjectAdminGrant(members)).toEqual({ kind: 'member', userId: 'lead' });
  });

  it('誰かが入っているAdminのgroupがあれば、直接付与のAdminは最後ではない', () => {
    const members = [
      member('lead', { directRole: 'admin' }),
      member('ml', { groups: [{ group: 'ml-admins', role: 'admin' }] }),
    ];
    expect(listProjectAdminGrants(members)).toHaveLength(2);
    expect(findLastProjectAdminGrant(members)).toBeNull();
  });

  it('メンバー一覧に出てこないgroup（まだ誰もログインしていない）はAdminに数えない', () => {
    const members = [member('lead', { directRole: 'admin' })];
    expect(groupsWithMembers(members).has('ml-admins-typo')).toBe(false);
    expect(findLastProjectAdminGrant(members)).toEqual({ kind: 'member', userId: 'lead' });
  });

  it('同じAdminのgroupに何人いても1つの付与で、それだけなら最後のAdminはそのgroup', () => {
    const members = [
      member('a', { groups: [{ group: 'ml-admins', role: 'admin' }] }),
      member('b', { groups: [{ group: 'ml-admins', role: 'admin' }] }),
    ];
    expect(findLastProjectAdminGrant(members)).toEqual({ kind: 'groupBinding', group: 'ml-admins' });
  });

  it('Service AccountのAdminは数えない', () => {
    const members = [
      member('lead', { directRole: 'admin' }),
      member('robot', { directRole: 'admin', kind: 'service' }),
    ];
    expect(findLastProjectAdminGrant(members)).toEqual({ kind: 'member', userId: 'lead' });
  });
});
