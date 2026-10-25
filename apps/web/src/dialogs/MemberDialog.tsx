import { useState } from 'react';
import type { ProjectMember, ProjectRole, UserSearchResult } from '@mmt/contracts';
import { Dialog } from '../components/Dialog';
import { ErrorNotice } from '../components/Feedback';
import { ProjectRoleSelect } from '../components/ProjectRoleSelect';
import { UserPicker } from '../components/UserPicker';
import { useMutation } from '../hooks/useMutation';
import { useProject } from '../hooks/useProject';
import { DEFAULT_MEMBER_GRANT_ROLE } from '../lib/projectMemberGrants';
import { useLocale } from '../i18n/useLocale';
import { useLocalizedMemo } from '../i18n/useLocalizedMemo';
import { text } from '../i18n/catalog';
import { projectAccessTextTemplates } from '../i18n/projectAccess';

/**
 * ユーザーを検索してメンバーを追加する。または既存のメンバーの直接付与のRoleを変える。
 * 編集なら`member`を渡す。ここで編集するのは直接付与のRoleだけなので、それが初期値になる。
 * 既に直接付与のある人は、追加では選べない。保存するとそのRoleを上書きする（PUTで設定する）
 * ため、追加済みとして並べ、一覧から変えてもらう。
 */
export function MemberDialog({
  member,
  existingMembers,
  onSave,
  onSaved,
  onClose,
}: {
  member?: ProjectMember;
  existingMembers: readonly ProjectMember[];
  onSave: (userId: string, role: ProjectRole) => Promise<unknown>;
  onSaved: () => void;
  onClose: () => void;
}) {
  useLocale();
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(
    member ? member.user : null,
  );
  // 新しいメンバーは作成のダイアログと同じRoleから始め、2つの追加の方法をそろえる。
  const [role, setRole] = useState<ProjectRole>(member?.directRole ?? DEFAULT_MEMBER_GRANT_ROLE);
  const alreadyAdded = useLocalizedMemo(
    () =>
      new Map(
        existingMembers.flatMap((existing) =>
          existing.directRole === null
            ? []
            : [
                [
                  existing.user.id,
                  projectAccessTextTemplates.memberAlreadyAdded(text[existing.directRole]),
                ] as const,
              ],
        ),
      ),
    [existingMembers],
  );
  const { project } = useProject();
  const [showUserRequired, setShowUserRequired] = useState(false);
  const mutation = useMutation();
  return (
    <Dialog
      title={member ? text.editMember : text.addMember}
      onClose={onClose}
      dismissible={!mutation.pending}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!selectedUser) {
            setShowUserRequired(true);
            return;
          }
          void mutation
            .run(async () => {
              await onSave(selectedUser.id, role);
              return true;
            })
            .then((saved) => {
              if (saved) onSaved();
            });
        }}
      >
        <fieldset disabled={mutation.pending}>
          {member ? (
            <div className="field">
              <span>{text.memberUser}</span>
              <span>
                {member.user.displayName} <span className="muted">{member.user.email}</span>
              </span>
            </div>
          ) : (
            <UserPicker
              label={text.memberUser}
              unavailableUsers={alreadyAdded}
              selectedUser={selectedUser}
              onSelect={(user) => {
                setSelectedUser(user);
                setShowUserRequired(false);
              }}
            />
          )}
          <ProjectRoleSelect label={text.directRole} value={role} onChange={setRole} />
          {project.visibility === 'public' && role === 'viewer' && (
            <p className="notice warning" role="status">
              {text.memberPublicViewerHint}
            </p>
          )}
          <p className="muted">{text.directRoleHint}</p>
        </fieldset>
        <ErrorNotice message={showUserRequired ? text.userSearchRequired : mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending}>
            {mutation.pending ? text.loading : text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
