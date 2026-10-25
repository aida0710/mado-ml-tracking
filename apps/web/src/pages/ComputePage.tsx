import { Link } from 'react-router-dom';
import { RefreshCw, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useProject } from '../hooks/useProject';
import { useProjectTargets } from '../hooks/useProjectTargets';
import { useProjectWorkers } from '../hooks/useProjectWorkers';
import { PageHeader } from '../components/PageHeader';
import { ComputeTargetsTable } from '../components/ComputeTargetsTable';
import { WorkerPresenceTable } from '../components/WorkerPresenceTable';
import { Resource } from '../components/Feedback';
import { settingsSectionPath } from '../layout/settingsSections';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * このProjectのJobを動かせるコンピュータ（読み取りのみ）と、Projectのworker。コンピュータの
 * 追加と管理は全体設定 → コンピュータで行い、このページからリンクする。
 */
export function ComputePage() {
  useLocale();
  const { user } = useAuth();
  const { project } = useProject();
  const targets = useProjectTargets(project.id);
  const workers = useProjectWorkers(project.id);
  return (
    <section className="page management-page">
      <PageHeader
        title={text.compute}
        eyebrow={project.name}
        actions={
          <>
            <Link className="button" to={settingsSectionPath('computers')}>
              <Settings size={15} />
              {text.openComputerSettings}
            </Link>
            <button className="icon-button" aria-label={text.refresh} onClick={targets.reload}>
              <RefreshCw size={17} />
            </button>
          </>
        }
      />
      <p className="muted">{text.projectComputersHint}</p>
      <Resource query={targets}>
        {(items) => <ComputeTargetsTable targets={items} workers={workers.value} user={user} />}
      </Resource>
      <section className="settings-section">
        <div className="section-heading">
          <h2>{text.workers}</h2>
        </div>
        <Resource query={workers}>
          {(items) => <WorkerPresenceTable workers={items} targets={targets.value ?? []} />}
        </Resource>
      </section>
    </section>
  );
}
