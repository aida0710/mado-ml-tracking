import type { ProjectRole } from '@mmt/contracts';

/**
 * Work one person started (a Job through its Run, a Sweep) is stopped, retried or changed by its
 * creator and by Project admins, so an editor cannot stop a colleague's training without knowing
 * it. The caller has already required the editor role.
 */
export function controlsStartedWork(
  caller: { role: ProjectRole; userId: string },
  work: { createdBy: string },
): boolean {
  return caller.role === 'admin' || work.createdBy === caller.userId;
}
