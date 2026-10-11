import { useState } from 'react';
import { useProject } from '../hooks/useProject';
import { useAuditEvents } from '../hooks/useAuditEvents';
import { useProjectMembers } from '../hooks/useProjectMembers';
import { useServiceAccounts } from '../hooks/useServiceAccounts';
import { PageHeader } from '../components/PageHeader';
import { ProjectSettings } from '../components/ProjectSettings';
import { ArtifactUsageSummary } from '../components/ArtifactUsageSummary';
import { RecordingConnectionGuide } from '../components/RecordingConnectionGuide';
import { ProjectMembers } from '../components/ProjectMembers';
import { ProjectGroupBindings } from '../components/ProjectGroupBindings';
import { ProjectTokens } from '../components/ProjectTokens';
import { ProjectServiceAccounts } from '../components/ProjectServiceAccounts';
import { NotificationSettings } from '../components/NotificationSettings';
import { ProjectArchiveSection } from '../components/ProjectArchiveSection';
import { AuditEventLog } from '../components/AuditEventLog';
import { ProjectSettingsContents } from '../components/ProjectSettingsContents';
import { projectAdminNames } from '../lib/projectAdminGrants';
import {
  PROJECT_SETTINGS_SECTION_IDS as sectionIds,
  projectSettingsSections,
} from '../lib/projectSettingsSections';
import { text } from '../i18n/catalog';

/**
 * The open Project's own settings. Creating and listing Projects belong to the Project switcher
 * and 全体管理.
 */
export function SettingsPage() {
  const { project, isProjectAdmin } = useProject();
  // The API refuses non-administrators, so they never request the log.
  const audit = useAuditEvents(isProjectAdmin ? { projectId: project.id } : null);
  // Shared so a group binding change also refreshes the effective roles in the member list.
  const projectMembers = useProjectMembers(project.id);
  // Shared so a key issued to a Service Account appears in the Project token list.
  const serviceAccounts = useServiceAccounts(project.id, isProjectAdmin);
  // ProjectTokens loads the personal tokens itself; remounting it shows a token issued from the
  // SDK and MLflow guide.
  const [tokenListRevision, setTokenListRevision] = useState(0);
  const reloadTokenLists = () => {
    setTokenListRevision((revision) => revision + 1);
    if (isProjectAdmin) serviceAccounts.projectTokens.reload();
  };
  return (
    <section className="page management-page">
      <PageHeader title={text.settings} eyebrow={project.name} />
      <ProjectSettingsContents sections={projectSettingsSections(isProjectAdmin)} />
      {/* Each part is wrapped in its anchor, so the parts need not know the contents. */}
      <div className="settings-grid">
        <div id={sectionIds.project} className="settings-anchor">
          <ProjectSettings
            adminNames={
              projectMembers.members.value && projectAdminNames(projectMembers.members.value)
            }
          />
        </div>
        <div id={sectionIds.usage} className="settings-anchor">
          <ArtifactUsageSummary projectId={project.id} />
        </div>
      </div>
      <div className="settings-stack">
        <div id={sectionIds.connection} className="settings-anchor">
          <RecordingConnectionGuide onTokenCreated={reloadTokenLists} />
        </div>
        <div id={sectionIds.members} className="settings-anchor">
          <ProjectMembers projectMembers={projectMembers} />
        </div>
        <div id={sectionIds.groups} className="settings-anchor">
          <ProjectGroupBindings projectMembers={projectMembers} />
        </div>
        {isProjectAdmin && (
          <div id={sectionIds.serviceAccounts} className="settings-anchor">
            <ProjectServiceAccounts access={serviceAccounts} />
          </div>
        )}
        <div id={sectionIds.tokens} className="settings-anchor">
          <ProjectTokens key={tokenListRevision} projectTokens={serviceAccounts.projectTokens} />
        </div>
        {isProjectAdmin && (
          <div id={sectionIds.notifications} className="settings-anchor">
            <NotificationSettings />
          </div>
        )}
        {isProjectAdmin && (
          <section id={sectionIds.audit} className="settings-section settings-anchor">
            <div className="section-heading">
              <h2>{text.auditEvents}</h2>
            </div>
            <AuditEventLog audit={audit} />
          </section>
        )}
        {isProjectAdmin && (
          <div id={sectionIds.archive} className="settings-anchor">
            <ProjectArchiveSection />
          </div>
        )}
      </div>
    </section>
  );
}
