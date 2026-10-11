import type { Project } from '@mmt/contracts';

/**
 * The Project list "/" shows when no Project opens by itself: the user's own Projects, and the
 * public ones they may enter without being a member. A global administrator's other private
 * Projects are left to 全体管理, so the list stays about the user's own work.
 */
export function splitProjectList(projects: readonly Project[]): {
  memberProjects: Project[];
  publicProjects: Project[];
} {
  return {
    memberProjects: projects.filter((project) => project.isMember),
    publicProjects: projects.filter(
      (project) => !project.isMember && project.visibility === 'public',
    ),
  };
}
