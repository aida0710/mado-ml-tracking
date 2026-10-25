import type { ProjectRole } from '@mmt/contracts';
import { accessApi } from '../api/access';
import { explainLastProjectAdminConflict } from '../lib/lastProjectAdminConflict';
import { useQuery } from './useQuery';

/** Projectのメンバーと実効Role、Project adminができる変更。 */
export function useProjectMembers(projectId: string) {
  const members = useQuery({ key: `${projectId}:members`, load: (signal) =>
    accessApi.members(projectId, signal),
  });
  return {
    members,
    saveMember: (userId: string, role: ProjectRole) =>
      explainLastProjectAdminConflict(accessApi.saveMember(projectId, userId, role)),
    removeMember: (userId: string) =>
      explainLastProjectAdminConflict(accessApi.removeMember(projectId, userId)),
  };
}
