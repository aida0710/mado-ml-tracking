import { useLocale } from '../../i18n/useLocale';
import { Link } from 'react-router-dom';
import type { AdminUser } from '@mmt/contracts';
import { ResponsiveTable } from '../ResponsiveTable';
import { formatDate } from '../../lib/format';
import { isSsoUser, userAuthSourceLabels } from '../../lib/adminUserDisplay';
import { PROJECT_SETTINGS_SECTION_IDS } from '../../lib/projectSettingsSections';
import { text, textTemplates } from '../../i18n/catalog';

export type UserAction = 'makeAdmin' | 'removeAdmin' | 'resetPassword' | 'disable' | 'enable';

/** Which actions the API would accept for this user; SSO roles and names come from the IdP. */
function availableActions(user: AdminUser): UserAction[] {
  const actions: UserAction[] = [];
  if (!isSsoUser(user) && user.kind === 'human')
    actions.push(user.isAdmin ? 'removeAdmin' : 'makeAdmin');
  if (user.authSources.includes('local')) actions.push('resetPassword');
  actions.push(user.status === 'active' ? 'disable' : 'enable');
  return actions;
}

const actionLabels: Record<UserAction, string> = {
  get makeAdmin() { return text.userMakeAdmin },
  get removeAdmin() { return text.userRemoveAdmin },
  get resetPassword() { return text.userResetPassword },
  get disable() { return text.userDisable },
  get enable() { return text.userEnable },
};

// What the API refuses for the last active global administrator (409).
const LAST_ADMIN_LOCKED_ACTIONS: readonly UserAction[] = ['disable', 'removeAdmin'];

/**
 * Users with their sign-in methods, state and actions. The signed-in administrator's own row says
 * so, the last active global administrator's disabling and demoting are locked with the reason,
 * and a Service Account names the Project it works for.
 */
export function UsersTable({
  users,
  currentUserId,
  lastActiveAdminId,
  onAction,
}: {
  users: AdminUser[];
  currentUserId: string;
  /** Null when there are several, or while that is unknown. */
  lastActiveAdminId: string | null;
  onAction: (user: AdminUser, action: UserAction) => void;
}) {
  useLocale();
  const isLocked = (user: AdminUser, action: UserAction) =>
    user.id === lastActiveAdminId && LAST_ADMIN_LOCKED_ACTIONS.includes(action);
  return (
    <ResponsiveTable
      rows={users}
      rowKey={(user) => user.id}
      empty={text.userNoMatches}
      columns={[
        {
          key: 'name',
          priority: 'primary',
          header: text.displayName,
          render: (user) => (
            <div className="user-name">
              <strong>
                {user.displayName}
                {user.id === currentUserId && (
                  <span className="user-self-tag">{text.userIsYou}</span>
                )}
              </strong>
              {user.username && <span className="muted mono">{user.username}</span>}
              {user.kind === 'service' && <ServiceAccountOrigin user={user} />}
            </div>
          ),
        },
        {
          key: 'email',
          priority: 'secondary',
          header: text.email,
          render: (user) => user.email || '—',
        },
        {
          key: 'authSources',
          priority: 'secondary',
          header: text.userAuthSources,
          render: (user) => userAuthSourceLabels(user).join(' / '),
        },
        {
          key: 'status',
          priority: 'primary',
          header: text.userStatusFilter,
          render: (user) => (
            <span className={`user-status ${user.status}`}>
              {user.status === 'active' ? text.userStatusActive : text.userStatusDisabled}
            </span>
          ),
        },
        {
          key: 'admin',
          priority: 'secondary',
          header: text.userGlobalAdmin,
          render: (user) => (
            <div className="user-admin">
              <span>{user.isAdmin ? text.userIsAdmin : text.userIsNotAdmin}</span>
              {isSsoUser(user) && <span className="muted">{text.userAdminFromSso}</span>}
            </div>
          ),
        },
        {
          key: 'lastLogin',
          priority: 'secondary',
          header: text.userLastLogin,
          render: (user) => formatDate(user.lastLoginAt),
        },
        {
          key: 'actions',
          priority: 'secondary',
          header: text.userActions,
          render: (user) => (
            <div className="user-actions">
              {availableActions(user).map((action) => (
                <button
                  key={action}
                  type="button"
                  className={action === 'disable' ? 'button small danger' : 'button small'}
                  disabled={isLocked(user, action)}
                  title={isLocked(user, action) ? text.userLastAdminLocked : undefined}
                  onClick={() => onAction(user, action)}
                >
                  {actionLabels[action]}
                </button>
              ))}
              {user.id === lastActiveAdminId && (
                <span className="muted user-locked-reason">{text.userLastAdminLocked}</span>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

/** Which Project a Service Account works for, leading to that Project's Service Accounts. */
function ServiceAccountOrigin({ user }: { user: AdminUser }) {
  useLocale();
  const project = user.serviceAccountProject;
  if (!project) return <span className="muted">{text.userServiceAccount}</span>;
  const settingsPath = `/projects/${encodeURIComponent(project.id)}/settings`;
  return (
    <Link className="muted" to={`${settingsPath}#${PROJECT_SETTINGS_SECTION_IDS.serviceAccounts}`}>
      {textTemplates.userServiceAccountProject(project.name)}
    </Link>
  );
}
