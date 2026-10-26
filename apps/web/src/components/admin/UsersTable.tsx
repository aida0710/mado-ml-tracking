import { Link } from 'react-router-dom';
import type { AdminUser } from '@mmt/contracts';
import { ResponsiveTable } from '../ResponsiveTable';
import { formatDate } from '../../lib/format';
import { isSsoUser, userAuthSourceLabels } from '../../lib/adminUserDisplay';
import { PROJECT_SETTINGS_SECTION_IDS } from '../../lib/projectSettingsSections';
import { useLocale } from '../../i18n/useLocale';
import { text, textTemplates } from '../../i18n/catalog';

export type UserAction = 'makeAdmin' | 'removeAdmin' | 'resetPassword' | 'disable' | 'enable';

/**
 * このユーザーに対してAPIが受け付ける操作。SSOの名前はIdPから来る。SSOの全体管理者権限は、
 * IdPのグループが決める設定（ssoManagesGlobalRole）のときだけIdPから来る。
 */
function availableActions(user: AdminUser, ssoManagesGlobalRole: boolean): UserAction[] {
  const actions: UserAction[] = [];
  const isAdminFromSso = ssoManagesGlobalRole && isSsoUser(user);
  if (!isAdminFromSso && user.kind === 'human')
    actions.push(user.isAdmin ? 'removeAdmin' : 'makeAdmin');
  if (user.authSources.includes('local')) actions.push('resetPassword');
  actions.push(user.status === 'active' ? 'disable' : 'enable');
  return actions;
}

const actionLabels: Record<UserAction, string> = {
  get makeAdmin() { return text.userMakeAdmin; },
  get removeAdmin() { return text.userRemoveAdmin; },
  get resetPassword() { return text.userResetPassword; },
  get disable() { return text.userDisable; },
  get enable() { return text.userEnable; },
};

// 最後の有効な全体管理者に対してAPIが拒む操作（409）。
const LAST_ADMIN_LOCKED_ACTIONS: readonly UserAction[] = ['disable', 'removeAdmin'];

/**
 * ユーザーをログイン方法、状態、操作とともに出す。ログイン中の管理者自身の行にはその旨を出し、
 * 最後の有効な全体管理者の無効化と管理者を外す操作は理由とともにロックする。Service Accountには
 * それが働くProjectを出す。
 */
export function UsersTable({
  users,
  currentUserId,
  lastActiveAdminId,
  ssoManagesGlobalRole,
  onAction,
}: {
  users: AdminUser[];
  currentUserId: string;
  /** 複数いるとき、またはまだ分からない間はnull。 */
  lastActiveAdminId: string | null;
  /** IdPのグループがSSOの利用者の全体管理者権限を決めるか（GET /auth/config）。 */
  ssoManagesGlobalRole: boolean;
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
                  <span className="status-badge status-accent user-self-tag">{text.userIsYou}</span>
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
          header: text.status,
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
              {ssoManagesGlobalRole && isSsoUser(user) && (
                <span className="muted">{text.userAdminFromSso}</span>
              )}
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
          header: text.actions,
          render: (user) => (
            <div className="user-actions">
              {availableActions(user, ssoManagesGlobalRole).map((action) => (
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

/** Service Accountが働くProject。そのProjectのService Accountの一覧へリンクする。 */
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
