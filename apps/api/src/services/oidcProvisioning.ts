import type { User } from '@mmt/contracts';
import type { PoolClient } from 'pg';
import { removesLastGlobalAdmin } from '../domain/globalAdminInvariant.js';
import {
  resolveOidcAccess,
  type GlobalRole,
  type OidcRolePolicy,
} from '../domain/oidcRolePolicy.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  findAutoLinkCandidates,
  findOidcIdentityUserId,
  findUser,
  insertOidcUser,
  listUserGroups,
  lockAccount,
  lockActiveGlobalAdminIds,
  recordLogin,
  recordOidcGroupSync,
  recordOidcIdentityLogin,
  replaceUserGroups,
  updateOidcUserProfile,
} from '../repositories/identityRepository.js';

// SSOのログインをユーザーに結び付ける。リンク済みのidentityを探し、必要なら確認済みのメールで
// ローカルのアカウントをリンクし、その場でユーザーを作り、全体のroleとグループをIdPから同期する。

export interface OidcClaims {
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  // claimの生の値。文字列でない要素はpolicyが捨てる。
  groups: readonly unknown[];
}

// SSOのログインを拒んだ理由。ユーザーにはどれも同じ401を返す。運用者はログと
// auth.oidc.deniedの監査イベントで理由を読む。
export type OidcLoginDenialReason =
  | 'email_not_verified'
  | 'group_not_allowed'
  | 'privileged_link_required'
  | 'user_disabled'
  | 'last_admin'
  | 'service_account';

export class OidcLoginDeniedError extends Error {
  constructor(
    readonly reason: OidcLoginDenialReason,
    readonly userId: string | null = null,
  ) {
    super(`OIDC login denied: ${reason}`);
    this.name = 'OidcLoginDeniedError';
  }
}

export interface OidcProvisioningPolicy {
  rolePolicy: OidcRolePolicy;
  autoLinkVerifiedEmail: boolean;
}

export interface OidcSyncInput {
  userId: string;
  claims: OidcClaims;
  rolePolicy: OidcRolePolicy;
  metadata?: RequestMetadata;
}

interface AccountOrigin {
  created: boolean;
  linkedExisting: boolean;
}

function globalRoleOf(isAdmin: boolean): GlobalRole {
  return isAdmin ? 'admin' : 'user';
}

function difference(left: string[], right: string[]): string[] {
  return left.filter((value) => !right.includes(value));
}

async function syncAccount(
  connection: PoolClient,
  input: OidcSyncInput,
  origin: AccountOrigin,
): Promise<User> {
  const { userId, claims } = input;
  const account = await lockAccount(connection, userId);
  if (!account) throw new Error('OIDC user is missing');
  // Service Accountは、SSOのidentityが手でリンクされていても、決してログインしない。
  if (account.kind !== 'human') throw new OidcLoginDeniedError('service_account', userId);
  // 無効化はこのアプリの中だけの設定なので、SSOのアカウントがまだ有効でも優先する。
  if (account.status !== 'active') throw new OidcLoginDeniedError('user_disabled', userId);
  const access = resolveOidcAccess(input.rolePolicy, claims.groups);
  if (!access.allowed) throw new OidcLoginDeniedError('group_not_allowed', userId);
  if (account.isAdmin && !access.isAdmin) {
    const activeAdminIds = await lockActiveGlobalAdminIds(connection);
    if (removesLastGlobalAdmin(activeAdminIds, { userId, isAdmin: false }))
      throw new OidcLoginDeniedError('last_admin', userId);
  }
  await updateOidcUserProfile(connection, {
    userId,
    email: claims.email,
    displayName: claims.displayName,
    isAdmin: access.isAdmin,
  });
  const groupsBefore = await listUserGroups(connection, userId);
  await replaceUserGroups(connection, userId, access.groups);
  await recordOidcGroupSync(connection, claims);
  const groupsAdded = difference(access.groups, groupsBefore);
  const groupsRemoved = difference(groupsBefore, access.groups);
  const globalRoleBefore = globalRoleOf(account.isAdmin);
  const changed =
    origin.created ||
    origin.linkedExisting ||
    globalRoleBefore !== access.globalRole ||
    groupsAdded.length > 0 ||
    groupsRemoved.length > 0;
  // roleの変更には権限の引き上げも含まれるので、同期と同じトランザクションで記録する。
  if (changed)
    await writeAuditEvent(connection, {
      actorType: 'user',
      actorUserId: userId,
      action: 'auth.oidc.sync',
      outcome: 'success',
      resourceType: 'user',
      resourceId: userId,
      details: {
        ...origin,
        globalRoleBefore,
        globalRoleAfter: access.globalRole,
        groupsAdded,
        groupsRemoved,
      },
      ...input.metadata,
    });
  return (await findUser(connection, userId))!;
}

// IdPの今のグループを、リンク済みのユーザーに当てはめる。sessionの再確認がUserInfoのclaimで
// これを呼ぶ。拒否されたら、そのユーザーはアクセスを失う必要がある。
export async function syncOidcIdentity(
  connection: PoolClient,
  input: OidcSyncInput,
): Promise<User> {
  return syncAccount(connection, input, { created: false, linkedExisting: false });
}

async function findLinkableLocalUserId(
  connection: PoolClient,
  email: string,
): Promise<string | undefined> {
  const candidates = await findAutoLinkCandidates(connection, email);
  // 同じメールのローカルアカウントが複数あると見分けられないので、どれもリンクしない。
  if (candidates.length !== 1) return undefined;
  const candidate = candidates[0]!;
  if (candidate.isPrivileged)
    throw new OidcLoginDeniedError('privileged_link_required', candidate.id);
  return candidate.id;
}

// 呼び出し元のトランザクションで動き、拒否したらユーザー、identity、グループの行を残さない。
export async function provisionOidcLogin(
  connection: PoolClient,
  login: { claims: OidcClaims; policy: OidcProvisioningPolicy; metadata?: RequestMetadata },
): Promise<User> {
  const { claims, policy } = login;
  if (!claims.emailVerified) throw new OidcLoginDeniedError('email_not_verified');
  let userId = await findOidcIdentityUserId(connection, claims);
  const access = resolveOidcAccess(policy.rolePolicy, claims.groups);
  // 誰かを作る前に確かめるので、許可されたグループの外のユーザーには行が作られない。
  if (!access.allowed) throw new OidcLoginDeniedError('group_not_allowed', userId ?? null);
  const origin: AccountOrigin = { created: false, linkedExisting: false };
  if (!userId && policy.autoLinkVerifiedEmail) {
    userId = await findLinkableLocalUserId(connection, claims.email);
    origin.linkedExisting = userId !== undefined;
  }
  if (!userId) {
    userId = await insertOidcUser(connection, claims);
    origin.created = true;
  }
  await recordOidcIdentityLogin(connection, {
    issuer: claims.issuer,
    subject: claims.subject,
    userId,
    email: claims.email,
    emailVerified: claims.emailVerified,
    groups: access.groups,
  });
  await recordLogin(connection, userId);
  return syncAccount(
    connection,
    { userId, claims, rolePolicy: policy.rolePolicy, metadata: login.metadata },
    origin,
  );
}
