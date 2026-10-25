import * as oidc from 'openid-client';
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';
import type { ApiConfig } from '../config.js';
import { transaction, type Database } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  consumeLogoutTokenId,
  revokeOidcIdentitySessions,
  revokeOidcSidSessions,
} from '../repositories/sessionRepository.js';

/**
 * OpenID Connect Back-Channel Logout 1.0。ユーザーがIdPでサインアウトするか無効にされると、IdPが
 * 署名つきのlogout tokenをPOSTし、対応するブラウザのsessionをここで終える。mado S3 Data Catalogと
 * 同じ検査を行う。
 */

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
// IdPはログアウトの直後にtokenを送る。それより古いものは、盗まれて再送されたものとして扱う。
const LOGOUT_TOKEN_MAX_AGE_SECONDS = 10 * 60;
// IdPとこのサーバーの時計の小さなずれを許す。
const LOGOUT_TOKEN_CLOCK_TOLERANCE_SECONDS = 60;
// jtiの記録は、そのtokenがまだ古さの検査を通る間だけ行を持てば足りる。
const LOGOUT_TOKEN_ID_RETENTION_SECONDS =
  LOGOUT_TOKEN_MAX_AGE_SECONDS + LOGOUT_TOKEN_CLOCK_TOLERANCE_SECONDS;
const MAX_LOGOUT_TOKEN_ID_LENGTH = 512;

export interface LogoutTokenClaims {
  jti: string;
  subject: string | null;
  sid: string | null;
}

function invalidLogoutToken(): DomainError {
  return new DomainError({
    status: 400,
    code: 'invalid_logout_token',
    message: 'invalid logout token',
  });
}

// jwtVerifyは署名、iss、aud、iatを確かめる。ここではlogout tokenであることを確かめる。
export function logoutTokenClaims(payload: JWTPayload): LogoutTokenClaims {
  const events = payload.events;
  if (
    !events ||
    typeof events !== 'object' ||
    Array.isArray(events) ||
    typeof (events as Record<string, unknown>)[BACKCHANNEL_LOGOUT_EVENT] !== 'object' ||
    // nonceがあるとID tokenになる。片方がもう片方になりすませないよう、仕様がnonceを禁じている。
    payload.nonce !== undefined
  )
    throw invalidLogoutToken();
  const subject = typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  const sid = typeof payload.sid === 'string' && payload.sid ? payload.sid : null;
  if (!subject && !sid) throw invalidLogoutToken();
  if (
    typeof payload.jti !== 'string' ||
    payload.jti === '' ||
    payload.jti.length > MAX_LOGOUT_TOKEN_ID_LENGTH
  )
    throw invalidLogoutToken();
  return { jti: payload.jti, subject, sid };
}

export class OidcBackchannelLogout {
  private signingKeys: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(
    private readonly options: {
      database: Database;
      settings: NonNullable<ApiConfig['oidc']>;
      provider: () => Promise<oidc.Configuration>;
      clock: () => Date;
    },
  ) {}

  async logout(logoutToken: string, metadata: RequestMetadata): Promise<void> {
    const { issuer, claims } = await this.verify(logoutToken);
    await transaction(this.options.database, async (connection) => {
      const now = this.options.clock();
      const accepted = await consumeLogoutTokenId(connection, {
        issuer,
        jti: claims.jti,
        now,
        expiresAt: new Date(now.getTime() + LOGOUT_TOKEN_ID_RETENTION_SECONDS * 1000),
      });
      if (!accepted)
        throw new DomainError({
          status: 400,
          code: 'logout_token_replayed',
          message: 'this logout token has already been used',
        });
      const revokedSessions = claims.sid
        ? await revokeOidcSidSessions(connection, {
            issuer,
            sid: claims.sid,
            subject: claims.subject,
          })
        : await revokeOidcIdentitySessions(connection, { issuer, subject: claims.subject! });
      await writeAuditEvent(connection, {
        actorType: 'system',
        action: 'auth.oidc.backchannel_logout',
        outcome: 'success',
        resourceType: 'oidc_identity',
        details: { subject: claims.subject, sid: claims.sid, revokedSessions },
        ...metadata,
      });
    });
  }

  private async verify(
    logoutToken: string,
  ): Promise<{ issuer: string; claims: LogoutTokenClaims }> {
    const { settings, clock } = this.options;
    const server = (await this.options.provider()).serverMetadata();
    if (!server.jwks_uri)
      throw new DomainError({
        status: 503,
        code: 'oidc_unavailable',
        message: 'cannot get the signing keys of the OIDC provider',
      });
    this.signingKeys ??= createRemoteJWKSet(new URL(server.jwks_uri));
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(logoutToken, this.signingKeys, {
        issuer: server.issuer,
        audience: settings.clientId,
        requiredClaims: ['iat', 'jti', 'events'],
        maxTokenAge: LOGOUT_TOKEN_MAX_AGE_SECONDS,
        clockTolerance: LOGOUT_TOKEN_CLOCK_TOLERANCE_SECONDS,
        currentDate: clock(),
      }));
    } catch (error) {
      // 鍵を取れなかったことはtokenについて何も示さない。5xxならIdPが再試行する。
      if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError))
        throw new DomainError({
          status: 503,
          code: 'oidc_unavailable',
          message: 'cannot get the signing keys of the OIDC provider',
        });
      throw invalidLogoutToken();
    }
    // sessionには設定したissuerを保存している。それがserver.issuerと等しいことは、
    // discoveryで確かめてある。
    return { issuer: settings.issuer, claims: logoutTokenClaims(payload) };
  }
}
