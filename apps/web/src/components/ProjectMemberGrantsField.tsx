import type { ProjectRole } from '@mmt/contracts';
import { useAuth } from '../hooks/useAuth';
import {
  addMemberGrant,
  changeMemberGrantRole,
  removeMemberGrant,
  type MemberGrantDraft,
} from '../lib/projectMemberGrants';
import { ProjectRoleOptions } from './ProjectRoleSelect';
import { UserSearchField } from './UserSearchField';
import { UserSummary } from './UserSummary';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * 新しいProjectの最初のメンバー。検索で見つけたユーザーを、変えられるRoleと外すボタン付きで並べる。
 * 作成者はいずれにせよProject adminになるので、候補に出さない。
 */
export function ProjectMemberGrantsField({
  drafts,
  onChange,
}: {
  drafts: MemberGrantDraft[];
  onChange: (drafts: MemberGrantDraft[]) => void;
}) {
  useLocale();
  const { user: creator } = useAuth();
  const excludedUserIds = [creator.id, ...drafts.map((draft) => draft.user.id)];
  return (
    <fieldset className="member-grants">
      <legend>{text.projectInitialMembers}</legend>
      <p className="muted">{text.projectInitialMembersHint}</p>
      <UserSearchField
        label={text.addMember}
        excludedUserIds={excludedUserIds}
        onPick={(user) => onChange(addMemberGrant(drafts, user))}
      />
      {drafts.length > 0 && (
        <ul className="member-grants-list">
          {drafts.map(({ user, role }) => (
            <li key={user.id}>
              <UserSummary user={user} />
              <select
                aria-label={textTemplates.projectMemberRole(user.displayName)}
                value={role}
                onChange={(event) =>
                  onChange(
                    changeMemberGrantRole(drafts, {
                      userId: user.id,
                      role: event.target.value as ProjectRole,
                    }),
                  )
                }
              >
                <ProjectRoleOptions />
              </select>
              <button
                type="button"
                className="button small"
                aria-label={textTemplates.projectMemberRemove(user.displayName)}
                onClick={() => onChange(removeMemberGrant(drafts, user.id))}
              >
                {text.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
