import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Project } from '@mmt/contracts';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/PageHeader';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { VisibilityLabel } from '../components/VisibilityLabel';
import { isGlobalAdmin } from '../lib/permissions';
import { splitProjectList } from '../lib/projectListSections';
import { projectHomePath } from '../layout/navigationLinks';
import { settingsSectionPath } from '../layout/settingsSections';
import { useUnreachableProjectReason } from '../hooks/useUnreachableProjectReason';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

function ProjectTable({ projects, empty }: { projects: Project[]; empty?: string }) {
  useLocale();
  return (
    <ResponsiveTable
      rows={projects}
      rowKey={(project) => project.id}
      empty={empty}
      columns={[
        {
          key: 'name',
          priority: 'primary',
          header: text.name,
          render: (project) => <Link to={projectHomePath(project.id)}>{project.name}</Link>,
        },
        {
          key: 'role',
          priority: 'primary',
          header: text.projectListRole,
          render: (project) => text[project.role],
        },
        {
          key: 'visibility',
          priority: 'secondary',
          header: text.projectVisibility,
          render: (project) => <VisibilityLabel visibility={project.visibility} />,
        },
        {
          key: 'description',
          priority: 'secondary',
          header: text.description,
          render: (project) => project.description || '—',
        },
      ]}
    />
  );
}

/**
 * 「/」が出す画面。Projectが自動で開かないとき（lib/lastOpenedProject）、Projectを
 * アーカイブした直後、URLが利用者の開けないProjectを指すとき（アーカイブされたかどうかも
 * 伝える）に出す。本人のProject、入れるpublicのProject、作成を並べる。クリックしない限り
 * どこにも入らないので、初めてのログインで他人の作業の中に入ってしまうことはない。
 */
export function ProjectListPage({
  projects,
  unreachableProjectId,
  archivedProjectName,
  onCreateProject,
}: {
  projects: Project[];
  /** URLが指したが、利用者が開けないProject。 */
  unreachableProjectId?: string;
  /** 利用者が設定からアーカイブしたばかりのProject。 */
  archivedProjectName: string | null;
  onCreateProject?: () => void;
}) {
  useLocale();
  const { user } = useAuth();
  const unreachableReason = useUnreachableProjectReason(unreachableProjectId);
  const { memberProjects, publicProjects } = splitProjectList(projects);
  return (
    <main id="content" className="page project-list-page">
      <PageHeader
        title={text.projectList}
        actions={
          onCreateProject && (
            <button className="button primary" onClick={onCreateProject}>
              <Plus size={15} />
              {text.newProject}
            </button>
          )
        }
      />
      {archivedProjectName && (
        <p className="notice success" role="status">
          {textTemplates.projectArchived(archivedProjectName)}
        </p>
      )}
      {unreachableReason && (
        <p className="notice error">
          {unreachableReason === 'archived'
            ? text.projectArchivedNotAccessible
            : text.projectNotAccessible}
        </p>
      )}
      <section className="settings-section">
        <div className="section-heading">
          <h2>{text.projectListMine}</h2>
        </div>
        <ProjectTable projects={memberProjects} empty={text.noProjects} />
        {memberProjects.length === 0 && (
          <p className="muted">
            {onCreateProject ? text.noProjectsCreateHint : text.noProjectsAskAdmin}
          </p>
        )}
      </section>
      {publicProjects.length > 0 && (
        <section className="settings-section">
          <div className="section-heading">
            <h2>{text.projectListPublic}</h2>
          </div>
          <p className="muted">{text.projectListPublicHint}</p>
          <ProjectTable projects={publicProjects} />
        </section>
      )}
      {isGlobalAdmin(user) && (
        <p className="muted">
          {text.projectListAdminHint}{' '}
          <Link to={settingsSectionPath('projects')}>{text.projectListAdminLink}</Link>
        </p>
      )}
    </main>
  );
}
