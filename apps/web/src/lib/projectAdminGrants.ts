import type { ProjectMember } from '@mmt/contracts';

// Mirrors the API's admin invariant (domain/projectAdminInvariant.ts) so the settings screen does
// not offer to lower or remove the last admin. A grant counts when a person can use it: a direct
// admin, or an admin binding of a group someone is in. The API stays the authority.

/** An admin grant that keeps the Project manageable. */
export type ProjectAdminGrant =
  | { kind: 'member'; userId: string }
  | { kind: 'groupBinding'; group: string };

function people(members: readonly ProjectMember[]): ProjectMember[] {
  return members.filter((member) => member.user.kind === 'human');
}

/**
 * Bound groups at least one person is in. The member list holds everyone a binding reaches, so a
 * bound group missing here has had nobody log in with it yet.
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

/** The only admin grant left, which must stay; null while there are two or more (or none). */
export function findLastProjectAdminGrant(
  members: readonly ProjectMember[],
): ProjectAdminGrant | null {
  const [onlyGrant, ...otherGrants] = listProjectAdminGrants(members);
  return onlyGrant && otherGrants.length === 0 ? onlyGrant : null;
}
