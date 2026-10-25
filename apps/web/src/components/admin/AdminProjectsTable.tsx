import { Link } from 'react-router-dom';
import type { AdminProject } from '@mmt/contracts';
import { ResponsiveTable } from '../ResponsiveTable';
import { VisibilityLabel } from '../VisibilityLabel';
import { formatDate } from '../../lib/format';
import { projectHomePath } from '../../layout/navigationLinks';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';
import { formatList } from '../../i18n/textJoining';

export type AdminProjectAction = 'archive' | 'restore' | 'purge';

/**
 * すべてのProjectを、公開範囲、Project admin（連絡する相手）、メンバー数、Run数、保存先、
 * 作成日、状態とともに出す。有効なProjectは名前から開けてアーカイブでき、アーカイブした
 * Projectは復元か完全な削除ができる。
 */
export function AdminProjectsTable({
  projects,
  onAction,
}: {
  projects: AdminProject[];
  onAction: (project: AdminProject, action: AdminProjectAction) => void;
}) {
  useLocale();
  return (
    <ResponsiveTable
      rows={projects}
      rowKey={(project) => project.id}
      label={text.adminSectionProjects}
      empty={text.adminProjectsEmpty}
      columns={[
        {
          key: 'name',
          priority: 'primary',
          header: text.name,
          render: (project) =>
            project.archivedAt === null ? (
              <Link to={projectHomePath(project.id)}>{project.name}</Link>
            ) : (
              project.name
            ),
        },
        {
          key: 'visibility',
          priority: 'primary',
          header: text.projectVisibility,
          render: (project) => <VisibilityLabel visibility={project.visibility} />,
        },
        {
          key: 'admins',
          priority: 'secondary',
          header: text.projectAdmins,
          render: (project) => formatList(project.adminNames) || text.projectAdminsNone,
        },
        {
          key: 'members',
          priority: 'secondary',
          header: text.projectMemberCount,
          render: (project) => project.memberCount,
        },
        {
          key: 'runs',
          priority: 'secondary',
          header: text.projectRunCount,
          render: (project) => project.runCount,
        },
        {
          key: 'storage',
          priority: 'secondary',
          header: text.storage,
          className: 'mono',
          render: (project) => project.artifactBackend,
        },
        {
          key: 'created',
          priority: 'secondary',
          header: text.created,
          render: (project) => formatDate(project.createdAt),
        },
        {
          key: 'state',
          priority: 'primary',
          header: text.status,
          render: (project) =>
            project.archivedAt === null ? (
              <span className="status-badge status-success">{text.projectStateActive}</span>
            ) : (
              <span
                className="status-badge status-neutral"
                title={textTemplates.projectArchivedAt(formatDate(project.archivedAt))}
              >
                {text.projectStateArchived}
              </span>
            ),
        },
        {
          key: 'actions',
          priority: 'secondary',
          header: text.actions,
          render: (project) => (
            <div className="access-actions">
              {project.archivedAt === null ? (
                <button className="button small" onClick={() => onAction(project, 'archive')}>
                  {text.projectArchive}
                </button>
              ) : (
                <>
                  <button className="button small" onClick={() => onAction(project, 'restore')}>
                    {text.projectRestore}
                  </button>
                  <button
                    className="button small danger"
                    onClick={() => onAction(project, 'purge')}
                  >
                    {text.projectPurge}
                  </button>
                </>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
