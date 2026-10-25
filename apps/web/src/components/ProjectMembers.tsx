import { useState } from 'react';
import type { ProjectMember, ProjectVisibility } from '@mmt/contracts';
import type { useProjectMembers } from '../hooks/useProjectMembers';
import { useProject } from '../hooks/useProject';
import { useAuth } from '../hooks/useAuth';
import { ResponsiveTable } from './ResponsiveTable';
import { Resource } from './Feedback';
import { ConfirmDialog } from './ConfirmDialog';
import { AccessGrantActions } from './AccessGrantActions';
import { MemberDialog } from '../dialogs/MemberDialog';
import {
  hasDirectGrant,
  listProjectMemberSources,
  type ProjectMemberSource,
} from '../lib/projectMemberSources';
import { findLastProjectAdminGrant } from '../lib/projectAdminGrants';
import { PROJECT_SETTINGS_SECTION_IDS } from '../lib/projectSettingsSections';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { projectAccessTextTemplates } from '../i18n/projectAccess';

// PublicのProjectは全員をEditorとして入れるが一覧には載せないので、載っていない人を
// 一覧の側で伝える。
const VISIBILITY_NOTES: Record<ProjectVisibility, string> = {
  get public() { return text.projectMembersPublicNote; },
  get private() { return text.projectMembersPrivateNote; },
};

/**
 * ProjectのRoleを持つ全員と、そのRoleの付与元、Project adminに向けた直接付与の操作。
 * Service Accountも並べるが、変更はtokenと同じそれ専用の欄で行う。
 */
export function ProjectMembers({
  projectMembers,
}: {
  projectMembers: ReturnType<typeof useProjectMembers>;
}) {
  useLocale();
  const { project, isProjectAdmin, reloadProjects } = useProject();
  const { user } = useAuth();
  const { members, saveMember, removeMember } = projectMembers;
  const lastAdminGrant = findLastProjectAdminGrant(members.value ?? []);
  const isLastAdmin = (member: ProjectMember) =>
    lastAdminGrant?.kind === 'member' && lastAdminGrant.userId === member.user.id;
  // PublicのProjectでは人はだれでもEditorとして入れるので、それより弱い付与は実際のRoleにならない。
  const isPublicEditor = (member: ProjectMember) =>
    project.visibility === 'public' && member.user.kind === 'human' && member.role === 'viewer';
  const [editing, setEditing] = useState<ProjectMember | 'new' | null>(null);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);
  // ログイン中の利用者自身のRoleが変わったかもしれず、それでアプリの枠が出すものが決まる。
  const reloadAfterChange = () => {
    members.reload();
    reloadProjects();
  };
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{text.members}</h2>
        {isProjectAdmin && (
          <button className="button small" onClick={() => setEditing('new')}>
            {text.addMember}
          </button>
        )}
      </div>
      <p className="muted">{VISIBILITY_NOTES[project.visibility]}</p>
      <Resource query={members}>
        {(items) => (
          <ResponsiveTable
            rows={items}
            rowKey={(member) => member.user.id}
            columns={[
              {
                key: 'name',
                priority: 'primary',
                header: text.name,
                render: (member) => (
                  <span className="member-name">
                    {member.user.displayName}
                    {member.user.kind === 'service' && (
                      <span className="user-status" title={text.memberServiceAccountHint}>
                        {text.memberServiceAccount}
                      </span>
                    )}
                    {member.user.status === 'disabled' && (
                      <span className="user-status disabled" title={text.memberDisabledHint}>
                        {text.memberDisabled}
                      </span>
                    )}
                  </span>
                ),
              },
              {
                key: 'email',
                priority: 'secondary',
                header: text.email,
                render: (member) => member.user.email,
              },
              {
                key: 'role',
                priority: 'primary',
                header: text.effectiveRole,
                render: (member) =>
                  isPublicEditor(member) ? (
                    <span title={text.memberPublicRoleHint}>
                      {projectAccessTextTemplates.memberPublicRole(text.editor)}
                    </span>
                  ) : (
                    text[member.role]
                  ),
              },
              {
                key: 'sources',
                priority: 'secondary',
                header: text.memberSources,
                render: (member) => (
                  <ul className="member-sources">
                    {listProjectMemberSources(member).map((source) => (
                      <li key={source.kind === 'direct' ? 'direct' : `group:${source.group}`}>
                        {describeSource(source)}
                      </li>
                    ))}
                  </ul>
                ),
              },
              ...(isProjectAdmin
                ? [
                    {
                      key: 'actions',
                      priority: 'secondary' as const,
                      header: text.actions,
                      render: (member: ProjectMember) =>
                        member.user.kind === 'service' ? (
                          <a
                            className="muted"
                            href={`#${PROJECT_SETTINGS_SECTION_IDS.serviceAccounts}`}
                          >
                            {text.memberServiceAccountManaged}
                          </a>
                        ) : hasDirectGrant(member) ? (
                          <AccessGrantActions
                            isLastAdmin={isLastAdmin(member)}
                            onEdit={() => setEditing(member)}
                            onRemove={() => setRemoving(member)}
                          />
                        ) : (
                          <span className="muted">{text.memberGrantedByGroup}</span>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Resource>
      {editing && (
        <MemberDialog
          member={editing === 'new' ? undefined : editing}
          existingMembers={members.value ?? []}
          onSave={saveMember}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAfterChange();
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={text.removeMember}
          message={projectAccessTextTemplates.removeMemberConfirm({
            displayName: removing.user.displayName,
            keepsGroupRole: removing.groups.length > 0,
            isSelf: removing.user.id === user.id,
          })}
          confirmLabel={text.remove}
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={() => removeMember(removing.user.id)}
          onConfirmed={() => {
            setRemoving(null);
            reloadAfterChange();
          }}
        />
      )}
    </section>
  );
}

function describeSource(source: ProjectMemberSource): string {
  const origin =
    source.kind === 'direct'
      ? text.memberSourceDirect
      : projectAccessTextTemplates.memberSourceGroup(source.group);
  return `${origin}: ${text[source.role]}`;
}
