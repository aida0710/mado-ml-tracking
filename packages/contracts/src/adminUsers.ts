import type { User } from './index.js';

// launcherのユーザーは自分のtokenだけを持つ（docs/sites.md）。Projectのメンバーには決してならない。
export type UserKind = 'human' | 'service' | 'launcher';

/** 全体管理者から見たユーザー（GET /admin/users）。 */
export interface AdminUser extends User {
  lastLoginAt: string | null;
  createdAt: string;
  /** Service Accountが属するProject。それ以外のユーザーではnull。 */
  serviceAccountProject: { id: string; name: string } | null;
}

export interface AdminUserQuery {
  /** ユーザー名・メールアドレス・表示名への部分一致。大文字と小文字は区別しない。 */
  query?: string;
  status?: User['status'];
  kind?: UserKind;
}

/** POST /admin/users: 最初のログインでパスワードの変更を求めるローカルアカウント。 */
export interface AdminUserCreate {
  username: string;
  displayName: string;
  email?: string;
  /** 仮のパスワード。UTF-8で12〜1024バイト。 */
  password: string;
  isAdmin: boolean;
}

/** PATCH /admin/users/:id。SSOのユーザーのisAdminとdisplayNameはIdPから来るので、変更を拒む。 */
export interface AdminUserPatch {
  status?: User['status'];
  displayName?: string;
  isAdmin?: boolean;
}

/** POST /admin/users/:id/reset-password。パスワードはこの応答でだけ返す。 */
export interface AdminUserPasswordReset {
  temporaryPassword: string;
}

/** GET /account: ログインしているユーザー自身のプロフィール。 */
export interface Account {
  user: AdminUser;
  /** 最後のログインで得たSSOのgroup。正本はAuthentikなので読み取り専用。 */
  groups: string[];
  groupsSyncedAt: string | null;
  /** 呼び出したsessionのログイン方法。API tokenではnull。 */
  sessionAuthMethod: 'local' | 'oidc' | 'development' | null;
}
