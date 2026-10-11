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

/**
 * The Project switcher's order: the user's own Projects first, then those reached only because
 * they are public or the user is a global administrator, each group in the API's order.
 */
export function memberProjectsFirst(projects: readonly Project[]): Project[] {
  return [
    ...projects.filter((project) => project.isMember),
    ...projects.filter((project) => !project.isMember),
  ];
}
