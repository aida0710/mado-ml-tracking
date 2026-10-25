import { useState } from 'react';
import type { ProjectGroupBinding } from '@mmt/contracts';
import { useProject } from '../hooks/useProject';
import type { useProjectMembers } from '../hooks/useProjectMembers';
import { useGroupNameCandidates, useProjectGroupBindings } from '../hooks/useProjectGroupBindings';
import { ResponsiveTable } from './ResponsiveTable';
import { Resource } from './Feedback';
import { ConfirmDialog } from './ConfirmDialog';
import { AccessGrantActions } from './AccessGrantActions';
import { GroupBindingDialog } from '../dialogs/GroupBindingDialog';
import { formatDate } from '../lib/format';
import { findLastProjectAdminGrant, groupsWithMembers } from '../lib/projectAdminGrants';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { projectAccessTextTemplates } from '../i18n/projectAccess';

/**
 * Authentikのgroupへ付与したRole。メンバーの一覧（ProjectMembersと共有し、変更の後に読み直す）
 * から、付与したgroupのうちまだだれもログインしていないものと、最後のAdminの付与がどれかが分かる。
 */
export function ProjectGroupBindings({
  projectMembers,
}: {
  projectMembers: ReturnType<typeof useProjectMembers>;
}) {
  useLocale();
  const { project, isProjectAdmin, reloadProjects } = useProject();
  const { bindings, saveGroupBinding, removeGroupBinding } = useProjectGroupBindings(project.id);
  const [editing, setEditing] = useState<ProjectGroupBinding | 'new' | null>(null);
  const [removing, setRemoving] = useState<ProjectGroupBinding | null>(null);
  const members = projectMembers.members.value;
  const heldGroups = groupsWithMembers(members ?? []);
  const lastAdminGrant = findLastProjectAdminGrant(members ?? []);
  const isLastAdmin = (binding: ProjectGroupBinding) =>
    lastAdminGrant?.kind === 'groupBinding' && lastAdminGrant.group === binding.group;
  const reloadAfterChange = () => {
    bindings.reload();
    projectMembers.members.reload();
    reloadProjects();
  };
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{text.groupBindings}</h2>
        {isProjectAdmin && (
          <button className="button small" onClick={() => setEditing('new')}>
            {text.addGroupBinding}
          </button>
        )}
      </div>
      <p className="muted">{text.groupBindingsDescription}</p>
      <Resource query={bindings}>
        {(items) => (
          <ResponsiveTable
            rows={items}
            rowKey={(binding) => binding.group}
            empty={text.groupBindingsEmpty}
            columns={[
              {
                key: 'group',
                priority: 'primary',
                header: text.groupName,
                render: (binding) => (
                  <>
                    <span className="mono">{binding.group}</span>
                    {/* メンバーの一覧を読み込むまでは分からないので、その間は印を付けない。 */}
                    {members && !heldGroups.has(binding.group) && (
                      <span className="group-without-members" title={text.groupWithoutMembersHint}>
                        {text.groupWithoutMembers}
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: 'role',
                priority: 'primary',
                header: text.role,
                render: (binding) => text[binding.role],
              },
              {
                key: 'createdAt',
                priority: 'secondary',
                header: text.grantedAt,
                render: (binding) => formatDate(binding.createdAt),
              },
              ...(isProjectAdmin
                ? [
                    {
                      key: 'actions',
                      priority: 'secondary' as const,
                      header: text.actions,
                      render: (binding: ProjectGroupBinding) => (
                        <AccessGrantActions
                          isLastAdmin={isLastAdmin(binding)}
                          onEdit={() => setEditing(binding)}
                          onRemove={() => setRemoving(binding)}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Resource>
      {editing && (
        <GroupBindingEditor
          binding={editing === 'new' ? undefined : editing}
          existingBindings={bindings.value ?? []}
          onSave={saveGroupBinding}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAfterChange();
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={text.removeGroupBinding}
          message={projectAccessTextTemplates.removeGroupBindingConfirm(removing.group)}
          confirmLabel={text.remove}
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={() => removeGroupBinding(removing.group)}
          onConfirmed={() => {
            setRemoving(null);
            reloadAfterChange();
          }}
        />
      )}
    </section>
  );
}

// ダイアログを開くのはProject adminだけなので、group名はダイアログを開いている間だけ取得する。
function GroupBindingEditor(
  props: Omit<Parameters<typeof GroupBindingDialog>[0], 'groupNameCandidates'>,
) {
  useLocale();
  const groupNameCandidates = useGroupNameCandidates();
  return <GroupBindingDialog {...props} groupNameCandidates={groupNameCandidates} />;
}
