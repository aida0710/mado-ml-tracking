import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { useProject } from '../hooks/useProject';
import { ProjectArchiveDialog } from '../dialogs/ProjectArchiveDialog';
import type { ArchivedProjectState } from '../lib/archivedProjectState';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Project adminに向けた、Projectの設定の末尾。アーカイブするとProjectは見えなくなるがデータは残り、
 * 全体管理者が元に戻せる。アーカイブの後は、黙って別のProjectを開くのでなく、Projectの一覧で
 * アーカイブしたことを伝える。
 */
export function ProjectArchiveSection() {
  useLocale();
  const { project, reloadProjects } = useProject();
  const navigate = useNavigate();
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <section className="settings-section project-archive">
      <h2>{text.projectArchiveTitle}</h2>
      <p className="muted">{text.projectArchiveDescription}</p>
      <button className="button danger" onClick={() => setIsConfirming(true)}>
        <Archive size={15} />
        {text.projectArchive}
      </button>
      {isConfirming && (
        <ProjectArchiveDialog
          project={project}
          onArchived={() => {
            setIsConfirming(false);
            reloadProjects();
            const state: ArchivedProjectState = { archivedProjectName: project.name };
            navigate('/', { state });
          }}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </section>
  );
}
