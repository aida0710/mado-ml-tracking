import * as oidc from 'openid-client';
import type { ApiConfig } from '../config.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { findUser, withdrawOidcIdentityAccess } from '../repositories/identityRepository.js';
import {
  findOidcSessionState,
  recordOidcSessionCheck,
  revokeOidcIdentitySessions,
  revokeSessionByHash,
  type ActiveSession,
  type EncryptedSessionTokens,
  type OidcSessionState,
} from '../repositories/sessionRepository.js';
import { decryptSecret, encryptSecret, type SecretKey } from '../security/secretEncryption.js';
import { OidcLoginDeniedError, syncOidcIdentity, type OidcClaims } from './oidcProvisioning.js';

/**
 * SSOのブラウザのsessionをIdPと合わせ続ける。最後の確認がMMT_OIDC_RECHECK_SECONDSより古いsessionや、
 * access tokenが切れたsessionは、UserInfoに今のグループを問い合わせ（必要ならaccess tokenを
 * 更新する）、ログインと同じように当てはめる。許可されたグループから外れたら、そのidentityの
 * すべてのsessionを終える。IdPがtokenを拒んだら、このsessionを終える。IdPに届かなければ503を
 * 返し、sessionは残す（fail closed）。mado S3 Data Catalogのauth-oidc-session.tsと同じ設計。
 */

// IdPの期限の少し前に更新し、UserInfoを呼んでいる間にtokenが切れないようにする。
const TOKEN_EXPIRY_MARGIN_MS = 30_000;

export interface SessionTokens {
  accessToken: string;
  // IdPがrefresh tokenを出さないとき（offline_accessが無い）は無い。そのときはaccess tokenが
  // 切れるとsessionが終わる。
  refreshToken: string | null;
  expiresAt: Date | null;
}

// 再確認でsessionを終えた理由。auth.oidc.recheckの監査イベントに記録する。
export type OidcRecheckRevocationReason =
  'reauthentication_required' | 'idp_session_revoked' | OidcLoginDeniedError['reason'];

// contextで暗号文をsessionの行とtokenの種類に結び付けるので、写した値は使えない。
function tokenContext(tokenHash: string, kind: 'access' | 'refresh'): string {
  return `oidc-session:${tokenHash}:${kind}`;
}

export function encryptSessionTokens({
  key,
  tokenHash,
  tokens,
}: {
  key: SecretKey;
  tokenHash: string;
  tokens: SessionTokens;
}): EncryptedSessionTokens {
  const encrypt = (plaintext: string, kind: 'access' | 'refresh') =>
    encryptSecret({ key, plaintext, context: tokenContext(tokenHash, kind) }).payload;
  return {
    keyId: key.id,
    accessToken: encrypt(tokens.accessToken, 'access'),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken, 'refresh') : null,
    expiresAt: tokens.expiresAt,
  };
}

export function decryptSessionTokens({
  key,
  tokenHash,
  encrypted,
}: {
  key: SecretKey;
  tokenHash: string;
  encrypted: EncryptedSessionTokens;
}): SessionTokens {
  const decrypt = (payload: Buffer, kind: 'access' | 'refresh') =>
    decryptSecret({
      key,
      encrypted: { keyId: encrypted.keyId, payload },
      context: tokenContext(tokenHash, kind),
    });
  return {
    accessToken: decrypt(encrypted.accessToken, 'access'),
    refreshToken: encrypted.refreshToken ? decrypt(encrypted.refreshToken, 'refresh') : null,
    expiresAt: encrypted.expiresAt,
  };
}

// 更新の応答にrefresh_tokenが無いことがある。それは前のものが引き続き有効という意味。
export function sessionTokensFromResponse(
  response: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers,
  { now, previousRefreshToken }: { now: Date; previousRefreshToken: string | null },
): SessionTokens {
  const expiresIn = response.expiresIn();
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previousRefreshToken,
    expiresAt: expiresIn === undefined ? null : new Date(now.getTime() + expiresIn * 1000),
  };
}

// IdPが応答し、tokenを拒んだ。ユーザーがIdPでサインアウトしたか、認可が取り消された。
function isRefusedByIdentityProvider(error: unknown): boolean {
  if (error instanceof oidc.WWWAuthenticateChallengeError) return error.status === 401;
  if (error instanceof oidc.ResponseBodyError)
    return (
      error.error === 'invalid_grant' ||
      error.error === 'invalid_token' ||
      (error.status === 401 && error.error !== 'invalid_client')
    );
  return false;
}

class ReauthenticationRequiredError extends Error {
  constructor() {
    super('The SSO session has no usable tokens');
    this.name = 'ReauthenticationRequiredError';
  }
}

// identityとtokenがすべてそろっていて、IdPに問い合わせられるsession。
type CheckableSession = OidcSessionState & {
  issuer: string;
  subject: string;
  tokens: EncryptedSessionTokens;
};

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export interface OidcSessionVerifierOptions {
  database: Database;
  settings: NonNullable<ApiConfig['oidc']>;
  provider: () => Promise<oidc.Configuration>;
  clock: () => Date;
}

// current: 確認の時期ではなかった。rechecked: 今IdPが確かめ、ユーザーのグループと全体のroleが
// 変わっているかもしれない。revoked: sessionはもう使ってはならない。
export type OidcSessionVerdict = 'current' | 'rechecked' | 'revoked';

export class OidcSessionVerifier {
  // 1つのsessionにつき確認は一度に1つ。そのsessionへの同時のリクエストは同じ結果を待つ。
  private readonly checksInFlight = new Map<string, Promise<OidcSessionVerdict>>();

  constructor(private readonly options: OidcSessionVerifierOptions) {}

  async verify(session: ActiveSession): Promise<OidcSessionVerdict> {
    if (session.authMethod !== 'oidc') return 'current';
    if (this.isCurrent(session.oidcCheckedAt, session.tokenExpiresAt)) return 'current';
    const running = this.checksInFlight.get(session.tokenHash);
    if (running) return running;
    const check = this.recheck(session.tokenHash).finally(() =>
      this.checksInFlight.delete(session.tokenHash),
    );
    this.checksInFlight.set(session.tokenHash, check);
    return check;
  }

  private isCurrent(checkedAt: Date | null, tokenExpiresAt: Date | null): boolean {
    const now = this.options.clock().getTime();
    return (
      checkedAt !== null &&
      now - checkedAt.getTime() < this.options.settings.recheckSeconds * 1000 &&
      !this.isExpired(tokenExpiresAt)
    );
  }

  private isExpired(expiresAt: Date | null): boolean {
    return (
      expiresAt !== null &&
      expiresAt.getTime() - TOKEN_EXPIRY_MARGIN_MS <= this.options.clock().getTime()
    );
  }

  private async recheck(tokenHash: string): Promise<OidcSessionVerdict> {
    const { database, settings } = this.options;
    const state = await findOidcSessionState(database, tokenHash);
    if (!state) return 'revoked';
    // このリクエストが待っている間に、別のプロセスが確認した。
    if (state.tokens && this.isCurrent(state.checkedAt, state.tokens.expiresAt)) return 'rechecked';
    // migration 042より前のsessionや、別のissuerのsessionには、確認に使えるものが無い。
    if (!state.tokens || !state.issuer || state.issuer !== settings.issuer || !state.subject)
      return this.endSession(state, 'reauthentication_required');
    const session: CheckableSession = {
      ...state,
      issuer: state.issuer,
      subject: state.subject,
      tokens: state.tokens,
    };
    let tokens: SessionTokens;
    try {
      tokens = decryptSessionTokens({
        key: settings.sessionEncryptionKey,
        tokenHash,
        encrypted: session.tokens,
      });
    } catch {
      // 暗号化に使った鍵がその後差し替えられた。続けるには新たにログインするしかない。
      return this.endSession(state, 'reauthentication_required');
    }
    const provider = await this.options.provider();
    let current: { claims: oidc.UserInfoResponse; tokens: SessionTokens };
    try {
      current = await this.askIdentityProvider(provider, session.subject, tokens);
    } catch (error) {
      if (error instanceof ReauthenticationRequiredError)
        return this.endSession(session, 'reauthentication_required');
      if (isRefusedByIdentityProvider(error))
        return this.endSession(session, 'idp_session_revoked');
      // IdPの応答にはtokenが含まれうるので、ログにはエラーの種類だけを書く。
      console.error(
        JSON.stringify({
          event: 'oidc_session_check_failed',
          name: error instanceof Error ? error.name : 'Error',
          code: (error as { code?: unknown }).code ?? null,
        }),
      );
      throw new DomainError({
        status: 503,
        code: 'oidc_unavailable',
        message: 'cannot verify the SSO sign-in state; try again later',
      });
    }
    return this.applyCurrentClaims(session, current);
  }

  private async askIdentityProvider(
    provider: oidc.Configuration,
    subject: string,
    tokens: SessionTokens,
  ): Promise<{ claims: oidc.UserInfoResponse; tokens: SessionTokens }> {
    let current = tokens;
    let refreshed = false;
    if (this.isExpired(current.expiresAt)) {
      current = await this.refresh(provider, current);
      refreshed = true;
    }
    try {
      return {
        claims: await oidc.fetchUserInfo(provider, current.accessToken, subject),
        tokens: current,
      };
    } catch (error) {
      // IdPは、示した期限より前にaccess tokenを受け付けなくなることがある。1回だけ更新する。
      if (refreshed || !current.refreshToken || !isRefusedByIdentityProvider(error)) throw error;
      current = await this.refresh(provider, current);
      return {
        claims: await oidc.fetchUserInfo(provider, current.accessToken, subject),
        tokens: current,
      };
    }
  }

  private async refresh(
    provider: oidc.Configuration,
    tokens: SessionTokens,
  ): Promise<SessionTokens> {
    if (!tokens.refreshToken) throw new ReauthenticationRequiredError();
    const response = await oidc.refreshTokenGrant(provider, tokens.refreshToken);
    return sessionTokensFromResponse(response, {
      now: this.options.clock(),
      previousRefreshToken: tokens.refreshToken,
    });
  }

  private async applyCurrentClaims(
    state: CheckableSession,
    current: { claims: oidc.UserInfoResponse; tokens: SessionTokens },
  ): Promise<OidcSessionVerdict> {
    const { database, settings } = this.options;
    const user = await findUser(database, state.userId);
    if (!user) return 'revoked';
    const verifiedEmail =
      current.claims.email_verified === true ? stringClaim(current.claims.email) : undefined;
    const claims: OidcClaims = {
      issuer: settings.issuer,
      subject: state.subject,
      // UserInfoはプロフィールのclaimを省くことがある。そのときは保存済みの値を残す。
      // 確認されていないメールは決して保存しない。
      email: verifiedEmail ?? user.email,
      emailVerified: true,
      displayName: stringClaim(current.claims.name) ?? user.displayName,
      groups: Array.isArray(current.claims.groups) ? current.claims.groups : [],
    };
    try {
      const recorded = await transaction(database, async (connection) => {
        await syncOidcIdentity(connection, {
          userId: state.userId,
          claims,
          rolePolicy: settings.rolePolicy,
        });
        return recordOidcSessionCheck(connection, {
          tokenHash: state.tokenHash,
          previousCheckedAt: state.checkedAt,
          tokens: encryptSessionTokens({
            key: settings.sessionEncryptionKey,
            tokenHash: state.tokenHash,
            tokens: current.tokens,
          }),
          checkedAt: this.options.clock(),
        });
      });
      if (recorded) return 'rechecked';
      // 別の確認が先に新しいtokenを保存したか、その間にsessionが終わった。
      return (await findOidcSessionState(database, state.tokenHash)) ? 'rechecked' : 'revoked';
    } catch (error) {
      if (!(error instanceof OidcLoginDeniedError)) throw error;
      return this.withdrawIdentity(state, error);
    }
  }

  // このidentityはもうアプリを使えない。そのすべてのsessionを終え、グループを外す。
  private async withdrawIdentity(
    state: CheckableSession,
    denial: OidcLoginDeniedError,
  ): Promise<'revoked'> {
    await transaction(this.options.database, async (connection) => {
      const identity = { issuer: state.issuer, subject: state.subject, userId: state.userId };
      const revokedSessions = await revokeOidcIdentitySessions(connection, identity);
      await withdrawOidcIdentityAccess(connection, identity);
      await this.recordRevocation(connection, state, {
        reason: denial.reason,
        scope: 'identity',
        revokedSessions,
      });
    });
    return 'revoked';
  }

  private async endSession(
    state: OidcSessionState,
    reason: OidcRecheckRevocationReason,
  ): Promise<'revoked'> {
    await transaction(this.options.database, async (connection) => {
      await revokeSessionByHash(connection, state.tokenHash);
      await this.recordRevocation(connection, state, {
        reason,
        scope: 'session',
        revokedSessions: 1,
      });
    });
    return 'revoked';
  }

  private async recordRevocation(
    connection: Parameters<typeof writeAuditEvent>[0],
    state: OidcSessionState,
    revocation: {
      reason: OidcRecheckRevocationReason;
      scope: 'session' | 'identity';
      revokedSessions: number;
    },
  ): Promise<void> {
    console.error(
      JSON.stringify({ event: 'oidc_session_revoked', userId: state.userId, ...revocation }),
    );
    await writeAuditEvent(connection, {
      actorType: 'system',
      action: 'auth.oidc.recheck',
      outcome: 'denied',
      resourceType: 'user',
      resourceId: state.userId,
      details: { ...revocation, subject: state.subject },
    });
  }
}
