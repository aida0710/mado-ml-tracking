import type { Project } from '@mmt/contracts';

/**
 * Projectが自動で開かないときに"/"が表示するProjectの一覧。利用者自身のProjectと、メンバーで
 * なくても入れる公開のProject。全体管理者のそれ以外の非公開のProjectは全体管理に任せ、一覧は
 * 利用者自身の仕事のものだけにする。
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
 * Projectの切り替えの並び順。利用者自身のProjectを先に、公開されているか利用者が全体管理者で
 * あるために見えるだけのProjectを後に並べる。どちらもAPIの順を保つ。
 */
export function memberProjectsFirst(projects: readonly Project[]): Project[] {
  return [
    ...projects.filter((project) => project.isMember),
    ...projects.filter((project) => !project.isMember),
  ];
}
