import type { Project } from '@mmt/contracts';
import { ProjectSwitcher } from './ProjectSwitcher';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * 開いているProjectと、その中での利用者のロール。広い画面ではナビゲーションのサイドバーの先頭に
 * 置き（"sidebar"）、狭い画面では上部バーの下の1行のバーになる（"bar"）。バーでは切り替えが
 * 縮み、Projectの名前を省略して出す。
 */
export function ProjectBar({
  projects,
  project,
  placement,
  onCreateProject,
}: {
  projects: Project[];
  project?: Project;
  placement: 'bar' | 'sidebar';
  /** Projectを作れる人には、切り替えの最後に出す。 */
  onCreateProject?: () => void;
}) {
  useLocale();
  return (
    <div className={placement === 'sidebar' ? 'sidebar-project' : 'projectbar'}>
      <ProjectSwitcher projects={projects} project={project} onCreateProject={onCreateProject} />
      {project && <span className="project-role">{text[project.role]}</span>}
    </div>
  );
}
