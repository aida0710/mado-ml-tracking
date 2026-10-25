import type { User } from '@mmt/contracts';
import type { ApiConfig } from '../config.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { randomSecret } from '../auth/secrets.js';
import type { Principal } from '../auth/principal.js';
import {
  CURRENT_PASSWORD_LIMIT,
  LOCAL_LOGIN_IP_LIMIT,
  LOCAL_LOGIN_USERNAME_FAILURE_LIMIT,
  type AuthRateLimiter,
} from '../auth/authRateLimiter.js';
import { isAcceptablePasswordLength, type PasswordHasher } from '../auth/passwordHasher.js';
import {
  findLocalCredential,
  findLocalCredentialByUsername,
  recordLogin,
  rehashLocalPassword,
  replaceLocalPassword,
  findUser,
} from '../repositories/identityRepository.js';
import { createSession, revokeOtherSessions } from '../repositories/sessionRepository.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { loginAudit } from '../auth/authAuditEvents.js';

export interface LocalLogin {
  user: User;
  session: string;
  mustChangePassword: boolean;
}

// 存在しないユーザー、間違ったパスワード、無効なユーザーに同じ本文を返し、応答から
// 何も分からないようにする。
function invalidCredentials(): DomainError {
  return new DomainError({
    status: 401,
    code: 'invalid_credentials',
    message: 'incorrect username or password',
  });
}

export class LocalAuthService {
  private readonly database: Database;
  private readonly config: ApiConfig;
  private readonly rateLimiter: AuthRateLimiter;
  private readonly passwordHasher: PasswordHasher;
  // ユーザーが存在しないときもこのハッシュと照合し、応答時間をそろえる。
  private dummyPasswordHash: Promise<string> | undefined;

  constructor(dependencies: {
    database: Database;
    config: ApiConfig;
    rateLimiter: AuthRateLimiter;
    passwordHasher: PasswordHasher;
  }) {
    this.database = dependencies.database;
    this.config = dependencies.config;
    this.rateLimiter = dependencies.rateLimiter;
    this.passwordHasher = dependencies.passwordHasher;
  }

  async login(
    input: { username: string; password: string },
    metadata: RequestMetadata,
  ): Promise<LocalLogin> {
    if (!this.config.localLoginEnabled)
      throw new DomainError({
        status: 404,
        code: 'local_login_disabled',
        message: 'local account login is disabled',
      });
    const username = input.username.trim().toLowerCase();
    const usernameKey = `local-login:username:${username}`;
    this.rateLimiter.consumeOrThrow(
      `local-login:ip:${metadata.ipAddress ?? 'unknown'}`,
      LOCAL_LOGIN_IP_LIMIT,
    );
    this.rateLimiter.checkOrThrow(usernameKey, LOCAL_LOGIN_USERNAME_FAILURE_LIMIT);
    const credential = await findLocalCredentialByUsername(this.database, username);
    const isPasswordValid = await this.rateLimiter.passwordCheck(async () =>
      this.passwordHasher.verify(
        credential?.passwordHash ?? (await this.dummyHash()),
        input.password,
      ),
    );
    // Service Accountは、パスワードの行が足されていても、tokenを通してだけ動く。
    if (
      !credential ||
      !isPasswordValid ||
      credential.status !== 'active' ||
      credential.kind !== 'human'
    ) {
      this.rateLimiter.record(usernameKey, LOCAL_LOGIN_USERNAME_FAILURE_LIMIT);
      await writeAuditEvent(this.database, {
        ...loginAudit('local', metadata),
        actorType: 'system',
        outcome: 'failure',
        resourceId: credential?.userId ?? null,
        details: { method: 'local', username },
      });
      throw invalidCredentials();
    }
    const rehashedPasswordHash = this.passwordHasher.needsRehash(credential.passwordHash)
      ? await this.rateLimiter.passwordCheck(() => this.passwordHasher.hash(input.password))
      : undefined;
    return transaction(this.database, async (connection) => {
      // 照合の間にパスワードが変わったら、古いパスワードでsessionを開かせない。
      const current = await findLocalCredential(connection, credential.userId);
      if (current?.passwordHash !== credential.passwordHash || current.status !== 'active')
        throw invalidCredentials();
      if (rehashedPasswordHash)
        await rehashLocalPassword(connection, {
          userId: credential.userId,
          verifiedPasswordHash: credential.passwordHash,
          newPasswordHash: rehashedPasswordHash,
        });
      await recordLogin(connection, credential.userId);
      const session = await createSession(connection, {
        userId: credential.userId,
        authMethod: 'local',
        absoluteSeconds: this.config.session.absoluteSeconds,
      });
      await writeAuditEvent(connection, {
        ...loginAudit('local', metadata),
        actorType: 'user',
        actorUserId: credential.userId,
        outcome: 'success',
        resourceId: credential.userId,
        details: { method: 'local', username },
      });
      const user = (await findUser(connection, credential.userId))!;
      return { user, session, mustChangePassword: current.mustChangePassword };
    });
  }

  // 呼び出したsessionは残し、そのユーザーのほかのsessionを失効させる。
  async changePassword(
    principal: Principal,
    input: { currentPassword: string; newPassword: string },
    metadata: RequestMetadata,
  ): Promise<void> {
    if (!principal.session)
      throw new DomainError({
        status: 403,
        code: 'session_required',
        message: 'changing the password requires a signed-in session',
      });
    const userId = principal.user.id;
    const credential = await findLocalCredential(this.database, userId);
    if (!credential)
      throw new DomainError({
        status: 403,
        code: 'local_credential_unavailable',
        message: 'the user has no local account',
      });
    if (
      !isAcceptablePasswordLength(input.newPassword) ||
      input.newPassword === input.currentPassword
    )
      throw new DomainError({
        status: 422,
        code: 'weak_password',
        message: 'the new password must differ from the current one and be 12 to 1024 bytes',
      });
    this.rateLimiter.consumeOrThrow(`current-password:user:${userId}`, CURRENT_PASSWORD_LIMIT);
    const newPasswordHash = await this.rateLimiter.passwordCheck(async () =>
      (await this.passwordHasher.verify(credential.passwordHash, input.currentPassword))
        ? this.passwordHasher.hash(input.newPassword)
        : undefined,
    );
    const changeAudit = {
      actorType: 'user' as const,
      actorUserId: userId,
      action: 'auth.password.change',
      resourceType: 'user',
      resourceId: userId,
      ...metadata,
    };
    if (!newPasswordHash) {
      await writeAuditEvent(this.database, { ...changeAudit, outcome: 'failure' });
      throw new DomainError({
        status: 400,
        code: 'incorrect_password',
        message: 'current password is incorrect',
      });
    }
    await transaction(this.database, async (connection) => {
      const isReplaced = await replaceLocalPassword(connection, {
        userId,
        verifiedPasswordHash: credential.passwordHash,
        newPasswordHash,
        mustChangePassword: false,
      });
      if (!isReplaced)
        throw new DomainError({
          status: 409,
          code: 'password_changed_concurrently',
          message: 'the password was changed by another operation; sign in again',
        });
      await revokeOtherSessions(connection, {
        userId,
        keepTokenHash: principal.session!.tokenHash,
      });
      await writeAuditEvent(connection, { ...changeAudit, outcome: 'success' });
    });
  }

  private dummyHash(): Promise<string> {
    this.dummyPasswordHash ??= this.passwordHasher.hash(randomSecret());
    return this.dummyPasswordHash;
  }
}
