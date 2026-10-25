import type { ProjectMember, ProjectRole, User, UserSearchResult } from '@mmt/contracts';
import type { ProjectAdminGrants } from '../domain/projectAdminInvariant.js';
import { first, rows, type Connection } from '../db/database.js';

// auth_sourcesは利用者が持つログイン方法の一覧。開発用のログインはどちらも持たない。
export const userColumns = `u.id,u.email,u.display_name,u.is_admin,u.username,u.status,u.kind,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN EXISTS(SELECT 1 FROM user_local_credentials lc WHERE lc.user_id=u.id) THEN 'local' END,
    CASE WHEN EXISTS(SELECT 1 FROM user_oidc_identities oi WHERE oi.user_id=u.id) THEN 'oidc' END
  ]::text[],NULL) AS auth_sources`;

export interface LocalCredential {
  userId: string;
  passwordHash: string;
  mustChangePassword: boolean;
  status: User['status'];
  kind: User['kind'];
}

// 開発用のログインとデモのseedは、users自体の(issuer, subject)で利用者を見分ける。
export async function upsertIdentity(
  connection: Connection,
  identity: {
    issuer: string;
    subject: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
  },
): Promise<User> {
  const user = await first<User>(
    connection,
    `INSERT INTO users AS u(issuer,subject,email,display_name,is_admin) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(issuer,subject) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,is_admin=EXCLUDED.is_admin RETURNING ${userColumns}`,
    [identity.issuer, identity.subject, identity.email, identity.displayName, identity.isAdmin],
  );
  return user!;
}

export async function findUser(connection: Connection, userId: string): Promise<User | undefined> {
  return first<User>(connection, `SELECT ${userColumns} FROM users u WHERE u.id=$1`, [userId]);
}

/** `userIds`のうち存在する利用者の種類と状態。知らないidは除く。 */
export async function listUserStates(
  connection: Connection,
  userIds: readonly string[],
): Promise<Pick<User, 'id' | 'kind' | 'status'>[]> {
  return rows<Pick<User, 'id' | 'kind' | 'status'>>(
    connection,
    'SELECT id,kind,status FROM users WHERE id=ANY($1::uuid[])',
    [userIds],
  );
}

export interface OidcIdentityLogin {
  issuer: string;
  subject: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  groups: string[];
}

export interface LockedAccount {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  status: User['status'];
  kind: User['kind'];
}

export interface AutoLinkCandidate {
  id: string;
  // 全体管理者か、いずれかのProjectのadmin。こうしたアカウントをメールアドレスで結び付けると、
  // アカウントを明け渡すことになる。
  isPrivileged: boolean;
}

export async function findOidcIdentityUserId(
  connection: Connection,
  identity: { issuer: string; subject: string },
): Promise<string | undefined> {
  const linked = await first<{ userId: string }>(
    connection,
    'SELECT user_id FROM user_oidc_identities WHERE issuer=$1 AND subject=$2 FOR UPDATE',
    [identity.issuer, identity.subject],
  );
  return linked?.userId;
}

// このメールアドレスを持ち、まだどのSSOのidentityにも結び付いていないローカルのアカウント。
export async function findAutoLinkCandidates(
  connection: Connection,
  email: string,
): Promise<AutoLinkCandidate[]> {
  return rows<AutoLinkCandidate>(
    connection,
    `SELECT u.id,(u.is_admin OR EXISTS(SELECT 1 FROM project_members m WHERE m.user_id=u.id AND m.role='admin')) AS is_privileged
    FROM users u WHERE lower(u.email)=lower($1) AND u.kind='human'
    AND EXISTS(SELECT 1 FROM user_local_credentials c WHERE c.user_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM user_oidc_identities i WHERE i.user_id=u.id)
    ORDER BY u.id FOR UPDATE OF u`,
    [email],
  );
}

export async function insertOidcUser(
  connection: Connection,
  profile: { email: string; displayName: string },
): Promise<string> {
  const user = await first<{ id: string }>(
    connection,
    'INSERT INTO users(email,display_name) VALUES($1,$2) RETURNING id',
    [profile.email, profile.displayName],
  );
  return user!.id;
}

export async function lockAccount(
  connection: Connection,
  userId: string,
): Promise<LockedAccount | undefined> {
  return first<LockedAccount>(
    connection,
    'SELECT id,email,display_name,is_admin,status,kind FROM users WHERE id=$1 FOR UPDATE',
    [userId],
  );
}

// 全体管理者を減らしうる変更は、管理者を読む前に必ずこのロックを取る。同時に2人を降格しても、
// 互いに相手を残る管理者と見なすことが無いようにするため。advisory lockにすると、既に自分の
// usersの行を持っているトランザクションとデッドロックしない。
const GLOBAL_ADMIN_INVARIANT_LOCK = 'mmt.global_admin_invariant';

export async function lockActiveGlobalAdminIds(connection: Connection): Promise<string[]> {
  await connection.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    GLOBAL_ADMIN_INVARIANT_LOCK,
  ]);
  const admins = await rows<{ id: string }>(
    connection,
    "SELECT id FROM users WHERE is_admin AND status='active' ORDER BY id",
  );
  return admins.map((admin) => admin.id);
}

export async function updateOidcUserProfile(
  connection: Connection,
  profile: { userId: string; email: string; displayName: string; isAdmin: boolean },
): Promise<void> {
  await connection.query(
    'UPDATE users SET email=$2,display_name=$3,is_admin=$4,updated_at=now() WHERE id=$1',
    [profile.userId, profile.email, profile.displayName, profile.isAdmin],
  );
}

export async function recordOidcIdentityLogin(
  connection: Connection,
  login: OidcIdentityLogin,
): Promise<void> {
  await connection.query(
    `INSERT INTO user_oidc_identities(issuer,subject,user_id,email_at_login,email_verified,groups_at_login,last_login_at)
    VALUES($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT(issuer,subject) DO UPDATE SET email_at_login=EXCLUDED.email_at_login,
    email_verified=EXCLUDED.email_verified,groups_at_login=EXCLUDED.groups_at_login,last_login_at=now()`,
    [login.issuer, login.subject, login.userId, login.email, login.emailVerified, login.groups],
  );
}

export async function listUserGroups(connection: Connection, userId: string): Promise<string[]> {
  const groups = await rows<{ groupName: string }>(
    connection,
    'SELECT group_name FROM user_groups WHERE user_id=$1 ORDER BY group_name',
    [userId],
  );
  return groups.map((group) => group.groupName);
}

// user_groupsをgroupsと同じにし、変わらなかったグループも含めてsynced_atを更新する。
export async function replaceUserGroups(
  connection: Connection,
  userId: string,
  groups: string[],
): Promise<void> {
  await connection.query(
    'DELETE FROM user_groups WHERE user_id=$1 AND NOT (group_name = ANY($2::text[]))',
    [userId, groups],
  );
  await connection.query(
    `INSERT INTO user_groups(user_id,group_name,source,synced_at)
    SELECT $1,group_name,'oidc',now() FROM unnest($2::text[]) AS g(group_name)
    ON CONFLICT(user_id,group_name) DO UPDATE SET synced_at=now()`,
    [userId, groups],
  );
}

// そのidentityのグループの同期に成功したことを記録する。これ以降、その利用者のAPI tokenは
// 使えるままになる。
export async function recordOidcGroupSync(
  connection: Connection,
  identity: { issuer: string; subject: string },
): Promise<void> {
  await connection.query(
    'UPDATE user_oidc_identities SET groups_synced_at=now() WHERE issuer=$1 AND subject=$2',
    [identity.issuer, identity.subject],
  );
}

/**
 * IdPがそのidentityを拒んだ（例えば許可したグループから外れた）。グループを消してProjectの
 * グループの割り当てをすぐに止め、同期時刻が無いことで利用者のAPI tokenも止める。
 */
export async function withdrawOidcIdentityAccess(
  connection: Connection,
  identity: { issuer: string; subject: string; userId: string },
): Promise<void> {
  await connection.query(
    'UPDATE user_oidc_identities SET groups_synced_at=NULL WHERE issuer=$1 AND subject=$2',
    [identity.issuer, identity.subject],
  );
  await connection.query("DELETE FROM user_groups WHERE user_id=$1 AND source='oidc'", [
    identity.userId,
  ]);
}

export async function findLocalCredentialByUsername(
  connection: Connection,
  username: string,
): Promise<LocalCredential | undefined> {
  return first<LocalCredential>(
    connection,
    `SELECT c.user_id,c.password_hash,c.must_change_password,u.status,u.kind
    FROM user_local_credentials c JOIN users u ON u.id=c.user_id WHERE lower(u.username)=lower($1)`,
    [username],
  );
}

export async function findLocalCredential(
  connection: Connection,
  userId: string,
): Promise<LocalCredential | undefined> {
  return first<LocalCredential>(
    connection,
    `SELECT c.user_id,c.password_hash,c.must_change_password,u.status,u.kind
    FROM user_local_credentials c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1`,
    [userId],
  );
}

// 確かめたハッシュでcompare-and-setする。同時にパスワードが変わっていればfalseを返す。
export async function replaceLocalPassword(
  connection: Connection,
  change: {
    userId: string;
    verifiedPasswordHash: string;
    newPasswordHash: string;
    mustChangePassword: boolean;
  },
): Promise<boolean> {
  const updated = await connection.query(
    `UPDATE user_local_credentials SET password_hash=$3,must_change_password=$4,password_changed_at=now()
    WHERE user_id=$1 AND password_hash=$2`,
    [change.userId, change.verifiedPasswordHash, change.newPasswordHash, change.mustChangePassword],
  );
  return updated.rowCount === 1;
}

// ハッシュを作り直してもパスワード自体は変わらないので、password_changed_atはそのままにする。
export async function rehashLocalPassword(
  connection: Connection,
  change: { userId: string; verifiedPasswordHash: string; newPasswordHash: string },
): Promise<boolean> {
  const updated = await connection.query(
    'UPDATE user_local_credentials SET password_hash=$3 WHERE user_id=$1 AND password_hash=$2',
    [change.userId, change.verifiedPasswordHash, change.newPasswordHash],
  );
  return updated.rowCount === 1;
}

export async function recordLogin(connection: Connection, userId: string): Promise<void> {
  await connection.query('UPDATE users SET last_login_at=now() WHERE id=$1', [userId]);
}

// ローカルの管理者を作るか、リセットする。次のログインでパスワードの変更を求める。
export async function upsertLocalAdministrator(
  connection: Connection,
  administrator: { username: string; email: string; displayName: string; passwordHash: string },
): Promise<User> {
  const existing = await first<{ id: string }>(
    connection,
    'SELECT id FROM users WHERE lower(username)=lower($1) FOR UPDATE',
    [administrator.username],
  );
  const user = existing
    ? await first<{ id: string }>(
        connection,
        `UPDATE users SET is_admin=true,status='active',updated_at=now() WHERE id=$1 RETURNING id`,
        [existing.id],
      )
    : await first<{ id: string }>(
        connection,
        `INSERT INTO users(username,email,display_name,is_admin) VALUES($1,$2,$3,true) RETURNING id`,
        [administrator.username, administrator.email, administrator.displayName],
      );
  await connection.query(
    `INSERT INTO user_local_credentials(user_id,password_hash,must_change_password) VALUES($1,$2,true)
    ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,must_change_password=true,
    password_changed_at=now()`,
    [user!.id, administrator.passwordHash],
  );
  return (await findUser(connection, user!.id))!;
}

// 使うたびに記録するとリクエストごとに行を書くので、last_used_atはこの間隔より頻繁には進めない。
export const TOKEN_LAST_USED_WRITE_INTERVAL_SECONDS = 5 * 60;

export interface TokenIdentity {
  user: User;
  token: { id: string; projectId: string | null; scopes: string[]; expiresAt: string | null };
  // 所有者のSSOのidentityのグループが最近同期されていない。このtokenは使わせてはならない。
  isIdentitySyncStale: boolean;
}

/**
 * SSOのidentityを持つ利用者のtokenは、その利用者の最後のグループの同期の時点の情報でしかない。
 * 同期はブラウザでのログインとsessionの再確認で行う。どのidentityも`syncedAfter`より後に
 * 同期していなければ、tokenを古いと報告する。Service AccountにはSSOのidentityが無い。
 */
export async function tokenIdentity(
  connection: Connection,
  lookup: { tokenHash: string; syncedAfter: Date },
): Promise<TokenIdentity | undefined> {
  const identity = await first<
    User & {
      tokenId: string;
      projectId: string | null;
      scopes: string[];
      expiresAt: string | null;
      usageIsStale: boolean;
      isIdentitySyncStale: boolean;
    }
  >(
    connection,
    `SELECT ${userColumns},t.id AS token_id,t.project_id,t.scopes,t.expires_at,
    (t.last_used_at IS NULL OR t.last_used_at<now()-make_interval(secs=>$2)) AS usage_is_stale,
    (u.kind='human' AND EXISTS(SELECT 1 FROM user_oidc_identities i WHERE i.user_id=u.id)
      AND NOT EXISTS(SELECT 1 FROM user_oidc_identities i WHERE i.user_id=u.id AND i.groups_synced_at>$3))
      AS is_identity_sync_stale
    FROM api_tokens t JOIN users u ON u.id=t.user_id
    WHERE t.token_hash=$1 AND u.status='active' AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>now())
    AND (t.project_id IS NULL OR EXISTS(SELECT 1 FROM effective_project_roles e WHERE e.project_id=t.project_id AND e.user_id=t.user_id))`,
    [lookup.tokenHash, TOKEN_LAST_USED_WRITE_INTERVAL_SECONDS, lookup.syncedAfter],
  );
  if (!identity) return undefined;
  const { tokenId, projectId, scopes, expiresAt, usageIsStale, isIdentitySyncStale, ...user } = identity;
  // 古いtokenは拒否するので、その使用は記録しない。
  // 同時のリクエストが時刻を1回だけ書くよう、条件をUPDATEでも繰り返す。
  if (usageIsStale && !isIdentitySyncStale)
    await connection.query(
      `UPDATE api_tokens SET last_used_at=now() WHERE id=$1
      AND (last_used_at IS NULL OR last_used_at<now()-make_interval(secs=>$2))`,
      [tokenId, TOKEN_LAST_USED_WRITE_INTERVAL_SECONDS],
    );
  return { user, token: { id: tokenId, projectId, scopes, expiresAt }, isIdentitySyncStale };
}

// 直接のメンバーと、割り当てたグループに入っている利用者。公開のProjectに公開設定だけで
// 入れる利用者はメンバーではないので除く。
export async function listMembers(
  connection: Connection,
  projectId: string,
): Promise<ProjectMember[]> {
  const members = await rows<MemberRow>(
    connection,
    `${memberSelect} WHERE e.project_id=$1 ORDER BY u.email,u.id`,
    [projectId],
  );
  return members.map(toProjectMember);
}

export async function findMember(
  connection: Connection,
  member: { projectId: string; userId: string },
): Promise<ProjectMember | undefined> {
  const found = await first<MemberRow>(
    connection,
    `${memberSelect} WHERE e.project_id=$1 AND e.user_id=$2`,
    [member.projectId, member.userId],
  );
  return found && toProjectMember(found);
}

type MemberRow = User & Omit<ProjectMember, 'user'>;

const memberSelect = `SELECT ${userColumns},e.role,m.role AS direct_role,
  COALESCE((SELECT json_agg(json_build_object('group',b.group_name,'role',b.role) ORDER BY b.group_name)
    FROM project_group_bindings b JOIN user_groups g ON g.group_name=b.group_name
    WHERE b.project_id=e.project_id AND g.user_id=e.user_id),'[]'::json) AS groups
  FROM project_membership_roles e JOIN users u ON u.id=e.user_id
  LEFT JOIN project_members m ON m.project_id=e.project_id AND m.user_id=e.user_id`;

function toProjectMember({ role, directRole, groups, ...user }: MemberRow): ProjectMember {
  return { user, role, directRole, groups };
}

/** 直接の付与かグループの割り当てでroleを持っていればtrue。 */
export async function isProjectMember(
  connection: Connection,
  member: { projectId: string; userId: string },
): Promise<boolean> {
  return Boolean(
    await first(
      connection,
      'SELECT 1 FROM project_membership_roles WHERE project_id=$1 AND user_id=$2',
      [member.projectId, member.userId],
    ),
  );
}

export async function findDirectRole(
  connection: Connection,
  member: { projectId: string; userId: string },
): Promise<ProjectRole | null> {
  const membership = await first<{ role: ProjectRole }>(
    connection,
    'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2',
    [member.projectId, member.userId],
  );
  return membership?.role ?? null;
}

// adminの付与を外しうる変更をすべて直列にするため、最初にProjectの行をロックする。
// Service Accountは除く。Projectを管理できないので、adminの付与は人が持ち続ける必要がある。
export async function lockProjectAdminGrants(
  connection: Connection,
  projectId: string,
): Promise<ProjectAdminGrants> {
  await connection.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
  const directAdmins = await rows<{ userId: string }>(
    connection,
    `SELECT m.user_id FROM project_members m JOIN users u ON u.id=m.user_id
    WHERE m.project_id=$1 AND m.role='admin' AND u.kind='human' ORDER BY m.user_id`,
    [projectId],
  );
  // share lockにより、この変更をコミットする前に、ログイン時のグループの同期がグループを空に
  // するのを防ぐ。
  const adminGroupMembers = await rows<{ groupName: string }>(
    connection,
    `SELECT g.group_name FROM project_group_bindings b
    JOIN user_groups g ON g.group_name=b.group_name JOIN users u ON u.id=g.user_id
    WHERE b.project_id=$1 AND b.role='admin' AND u.kind='human'
    ORDER BY g.group_name,g.user_id FOR SHARE OF g`,
    [projectId],
  );
  return {
    directAdminUserIds: directAdmins.map((admin) => admin.userId),
    heldAdminGroupNames: [...new Set(adminGroupMembers.map((member) => member.groupName))],
  };
}

// 利用者の実際のroleを計算する元の行をトランザクションの終わりまで押さえ、書き込みの途中で
// membershipの変更やグループの同期によって権限が取り消されないようにする。割り当ての変更は、
// 呼び出し側がProjectの行に取ったshare lockで既に防いでいる。
export async function lockProjectRoleSources(
  connection: Connection,
  member: { projectId: string; userId: string },
): Promise<void> {
  await connection.query(
    'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2 FOR SHARE',
    [member.projectId, member.userId],
  );
  await connection.query('SELECT group_name FROM user_groups WHERE user_id=$1 FOR SHARE', [
    member.userId,
  ]);
}

export async function holdsAnyProjectAdminRole(
  connection: Connection,
  member: { userId: string; projectId: string | null },
): Promise<boolean> {
  const role = await first(
    connection,
    "SELECT 1 FROM effective_project_roles WHERE user_id=$1 AND role='admin' AND ($2::uuid IS NULL OR project_id=$2) LIMIT 1",
    [member.userId, member.projectId],
  );
  return !!role;
}

// メールアドレス、ユーザー名、表示名を、大文字と小文字を区別せずに前方一致で探す。無効にした
// 利用者は権限を与えられないので除き、Service Accountはroleをそのアカウント自体に設定するので除く。
export async function searchActiveUsers(
  connection: Connection,
  search: { query: string; limit: number },
): Promise<UserSearchResult[]> {
  const pattern = `${search.query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  return rows<UserSearchResult>(
    connection,
    `SELECT id,email,display_name FROM users WHERE status='active' AND kind='human'
    AND (email ILIKE $1 OR username ILIKE $1 OR display_name ILIKE $1)
    ORDER BY lower(email),id LIMIT $2`,
    [pattern, search.limit],
  );
}

export async function listKnownGroupNames(connection: Connection): Promise<string[]> {
  const groups = await rows<{ groupName: string }>(
    connection,
    'SELECT DISTINCT group_name FROM user_groups ORDER BY group_name',
  );
  return groups.map((group) => group.groupName);
}
