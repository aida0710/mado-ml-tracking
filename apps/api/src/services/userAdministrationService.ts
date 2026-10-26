import { randomBytes } from 'node:crypto';
import { TOKEN_SCOPES, type AdminUser, type AdminUserPasswordReset, type AdminUserQuery } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { isAcceptablePasswordLength, type PasswordHasher } from '../auth/passwordHasher.js';
import { transaction, type Database } from '../db/database.js';
import {
  ADMIN_USER_LIST_LIMIT,
  type AdminUserCreateInput,
  type AdminUserPatchInput,
} from '../domain/adminUserValidation.js';
import { DomainError, notFound } from '../domain/errors.js';
import { removesLastGlobalAdmin } from '../domain/globalAdminInvariant.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { lockActiveGlobalAdminIds } from '../repositories/identityRepository.js';
import { revokeAllForUser } from '../repositories/sessionRepository.js';
import { setServiceAccountStatus } from '../repositories/serviceAccountRepository.js';
import {
  findAdminUser,
  insertLocalUser,
  isUsernameTaken,
  listAdminUsers,
  lockAdminUser,
  resetLocalPassword,
  updateAdminUser,
} from '../repositories/userAdministrationRepository.js';
import { holdsScope, requireGlobalAdmin, requireScope } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

// 18バイトの乱数はbase64urlで24文字になり、最低の12バイトを十分に上回る。
const TEMPORARY_PASSWORD_BYTES = 18;

// 全体管理者のsessionか、`users:manage`を持つ制限の無い管理者のtoken。
function requireUserReader(principal: Principal): void {
  requireScope(principal, 'users:manage');
  requireGlobalAdmin(principal);
}

// アカウントを変えると、すべてのscopeを持つ管理者のログインを作れてしまう。そのため、tokenで
// 行えるのは、そのtoken自身が既にすべてのscopeを持つときだけにし、持っている以上の範囲に
// 届かないようにする。
function requireUserAdministrator(principal: Principal): void {
  requireUserReader(principal);
  const missingScopes = TOKEN_SCOPES.filter((scope) => !holdsScope(principal, scope));
  if (missingScopes.length)
    throw new DomainError({
      status: 403,
      code: 'scope_required',
      message: `changing users requires a token with all scopes; missing scopes: ${missingScopes.join(', ')}`,
      details: { scopes: missingScopes },
    });
}

// SSOの利用者は、ログインのたびに全体のroleと表示名をIdPから受け取る。
function isSsoUser(user: AdminUser): boolean {
  return user.authSources.includes('oidc');
}

/** 全体管理者が行う利用者の管理。ローカルアカウント、無効化、パスワードの再設定。 */
export class UserAdministrationService {
  constructor(
    private readonly options: {
      database: Database;
      passwordHasher: PasswordHasher;
      // trueならSSOの利用者の全体管理者権限はログインのたびにIdPのグループから上書きされる。
      idpManagesGlobalRole: boolean;
    },
  ) {}

  async list(principal: Principal, query: AdminUserQuery): Promise<AdminUser[]> {
    requireUserReader(principal);
    return listAdminUsers(this.options.database, { ...query, limit: ADMIN_USER_LIST_LIMIT });
  }

  async create(
    principal: Principal,
    input: AdminUserCreateInput,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<AdminUser> {
    // 一時パスワードは監査ログに入れない。
    const draft = this.auditDraft(principal, request, 'admin.user.create', null, {
      username: input.username,
      isAdmin: input.isAdmin,
    });
    return recordDenial(this.options.database, draft, async () => {
      requireUserAdministrator(principal);
      const passwordHash = await this.hashTemporaryPassword(input.password);
      return transaction(this.options.database, async (connection) => {
        if (await isUsernameTaken(connection, input.username))
          throw new DomainError({
            status: 409,
            code: 'username_taken',
            message: 'a user with the same username already exists',
          });
        const userId = await insertLocalUser(connection, {
          username: input.username,
          displayName: input.displayName,
          email: input.email ?? '',
          isAdmin: input.isAdmin,
          passwordHash,
        });
        await writeAuditEvent(connection, { ...draft, outcome: 'success', resourceId: userId });
        return (await findAdminUser(connection, userId))!;
      });
    });
  }

  async update(
    principal: Principal,
    userId: string,
    patch: AdminUserPatchInput,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<AdminUser> {
    const draft = this.auditDraft(principal, request, 'admin.user.update', userId, {
      changedFields: Object.keys(patch).sort(),
    });
    return recordDenial(this.options.database, draft, async () => {
      requireUserAdministrator(principal);
      return transaction(this.options.database, async (connection) => {
        const current = await lockAdminUser(connection, userId);
        if (!current) notFound('user');
        const next = {
          status: patch.status ?? current.status,
          displayName: patch.displayName ?? current.displayName,
          isAdmin: patch.isAdmin ?? current.isAdmin,
        };
        this.validateChange(current, next);
        // 全体管理者についての不変条件から決まる順序。利用者の行が先で、そのあとで管理者のロック。
        const activeAdminIds = await lockActiveGlobalAdminIds(connection);
        if (removesLastGlobalAdmin(activeAdminIds, { userId, ...next }))
          throw new DomainError({
            status: 409,
            code: 'last_active_admin',
            message: 'the last active global administrator cannot be disabled or demoted',
          });
        await updateAdminUser(connection, { userId, ...next });
        // ここで無効にしたService Accountは、Projectの設定から無効にしたものと同じに見える。
        if (current.kind === 'service' && next.status !== current.status)
          await setServiceAccountStatus(connection, { serviceAccountId: userId, status: next.status });
        // tokenはusers.statusの確認で止まる。sessionは、再び使えるようにならないよう失効させる。
        if (next.status === 'disabled' && current.status !== 'disabled')
          await revokeAllForUser(connection, userId);
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            ...draft.details,
            before: {
              status: current.status,
              isAdmin: current.isAdmin,
              displayName: current.displayName,
            },
            after: next,
          },
        });
        return (await findAdminUser(connection, userId))!;
      });
    });
  }

  async resetPassword(
    principal: Principal,
    userId: string,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<AdminUserPasswordReset> {
    const draft = this.auditDraft(principal, request, 'admin.user.password_reset', userId, {});
    return recordDenial(this.options.database, draft, async () => {
      requireUserAdministrator(principal);
      const temporaryPassword = randomBytes(TEMPORARY_PASSWORD_BYTES).toString('base64url');
      const passwordHash = await this.options.passwordHasher.hash(temporaryPassword);
      await transaction(this.options.database, async (connection) => {
        const user = await lockAdminUser(connection, userId);
        if (!user) notFound('user');
        if (!(await resetLocalPassword(connection, { userId, passwordHash })))
          throw new DomainError({
            status: 422,
            code: 'local_credential_unavailable',
            message: 'the password of a user without a local account cannot be reset',
          });
        await revokeAllForUser(connection, userId);
        await writeAuditEvent(connection, { ...draft, outcome: 'success' });
      });
      return { temporaryPassword };
    });
  }

  private validateChange(
    current: AdminUser,
    next: Pick<AdminUser, 'status' | 'displayName' | 'isAdmin'>,
  ): void {
    const isAdminFromIdp = this.options.idpManagesGlobalRole && isSsoUser(current);
    if (isAdminFromIdp && next.isAdmin !== current.isAdmin)
      throw new DomainError({
        status: 422,
        code: 'admin_role_managed_by_sso',
        message: 'the global administrator permission of an SSO user is decided by Authentik groups and cannot be changed',
      });
    if (isSsoUser(current) && next.displayName !== current.displayName)
      throw new DomainError({
        status: 422,
        code: 'profile_managed_by_sso',
        message: 'the display name of an SSO user is synchronized from Authentik and cannot be changed',
      });
    if (current.kind === 'service' && next.isAdmin)
      throw new DomainError({
        status: 422,
        code: 'service_account_admin_forbidden',
        message: 'a service account cannot be a global administrator',
      });
  }

  private async hashTemporaryPassword(password: string): Promise<string> {
    if (!isAcceptablePasswordLength(password))
      throw new DomainError({
        status: 422,
        code: 'weak_password',
        message: 'the initial password must be 12 to 1024 bytes',
      });
    return this.options.passwordHasher.hash(password);
  }

  private auditDraft(
    principal: Principal,
    request: RequestMetadata,
    action: string,
    userId: string | null,
    details: AuditEventDraft['details'],
  ): AuditEventDraft {
    return {
      ...auditActor(principal),
      ...request,
      action,
      resourceType: 'user',
      resourceId: userId,
      details,
    };
  }
}
