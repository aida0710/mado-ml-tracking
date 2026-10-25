import type { User } from '@mmt/contracts';
import { first, type Connection } from '../db/database.js';
import { hashSecret, randomSecret } from '../auth/secrets.js';
import type { SessionAuthMethod } from '../auth/principal.js';
import { userColumns } from './identityRepository.js';

// 読み取りのたびに書き込みが起きないよう、last_seen_atは1分に1回までしか書かない。
const LAST_SEEN_UPDATE_INTERVAL_SECONDS = 60;

export interface ActiveSession {
  user: User;
  tokenHash: string;
  authMethod: SessionAuthMethod;
  mustChangePassword: boolean;
  // IdPがSSOのsessionを最後に確かめた時刻。ほかのsessionやtokenの無いSSOのsessionではnull。
  oidcCheckedAt: Date | null;
  tokenExpiresAt: Date | null;
}

// SSOのsessionが持つIdPのtoken。どれも同じsession暗号鍵で暗号化する。
export interface EncryptedSessionTokens {
  keyId: string;
  accessToken: Buffer;
  refreshToken: Buffer | null;
  expiresAt: Date | null;
}

export interface OidcSessionBinding {
  issuer: string;
  subject: string;
  sid: string | null;
}

// sessionの再確認で読むもの。UserInfoに問い合わせる利用者と、問い合わせに使うtoken。
export interface OidcSessionState {
  tokenHash: string;
  userId: string;
  issuer: string | null;
  subject: string | null;
  tokens: EncryptedSessionTokens | null;
  checkedAt: Date | null;
}

// 失効と同時に保存したIdPのtokenを消し、失効したsessionに認証情報を残さない。
const REVOKE_SET =
  'revoked_at=now(),token_key_id=NULL,access_token_enc=NULL,refresh_token_enc=NULL';

// 行の時刻はISO形式の文字列で届く（mapColumnsを参照）。再確認ではDateで比べる。
function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

// 呼び出し側が暗号化したデータをtokenのハッシュに結び付けられるよう、tokenは行を作る前に決める。
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomSecret();
  return { token, tokenHash: hashSecret(token) };
}

export async function createSession(
  connection: Connection,
  session: {
    userId: string;
    authMethod: SessionAuthMethod;
    absoluteSeconds: number;
    token?: { token: string; tokenHash: string };
    oidc?: { binding: OidcSessionBinding; tokens: EncryptedSessionTokens; checkedAt: Date };
  },
): Promise<string> {
  const { token, tokenHash } = session.token ?? newSessionToken();
  const oidc = session.oidc;
  await connection.query('DELETE FROM sessions WHERE expires_at<=now()');
  await connection.query(
    `INSERT INTO sessions(token_hash,user_id,auth_method,expires_at,
      oidc_issuer,oidc_subject,oidc_sid,token_key_id,access_token_enc,refresh_token_enc,
      token_expires_at,oidc_checked_at)
    VALUES($1,$2,$3,now()+make_interval(secs=>$4),$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      tokenHash,
      session.userId,
      session.authMethod,
      session.absoluteSeconds,
      oidc?.binding.issuer ?? null,
      oidc?.binding.subject ?? null,
      oidc?.binding.sid ?? null,
      oidc?.tokens.keyId ?? null,
      oidc?.tokens.accessToken ?? null,
      oidc?.tokens.refreshToken ?? null,
      oidc?.tokens.expiresAt ?? null,
      oidc?.checkedAt ?? null,
    ],
  );
  return token;
}

// sessionが使えるのは、失効しておらず、絶対期限とアイドル期限の内にあり、利用者が有効な間。
export async function findActiveSession(
  connection: Connection,
  token: string,
  idleSeconds: number,
): Promise<ActiveSession | undefined> {
  const tokenHash = hashSecret(token);
  const session = await first<
    User & {
      authMethod: SessionAuthMethod;
      mustChangePassword: boolean;
      isLastSeenStale: boolean;
      oidcCheckedAt: string | null;
      tokenExpiresAt: string | null;
    }
  >(
    connection,
    `SELECT ${userColumns},s.auth_method,s.oidc_checked_at,s.token_expires_at,
      (s.auth_method='local' AND COALESCE(c.must_change_password,false)) AS must_change_password,
      s.last_seen_at<now()-make_interval(secs=>$3) AS is_last_seen_stale
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN user_local_credentials c ON c.user_id=u.id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
    AND s.last_seen_at>now()-make_interval(secs=>$2) AND u.status='active'`,
    [tokenHash, idleSeconds, LAST_SEEN_UPDATE_INTERVAL_SECONDS],
  );
  if (!session) return undefined;
  const {
    authMethod,
    mustChangePassword,
    isLastSeenStale,
    oidcCheckedAt,
    tokenExpiresAt,
    ...user
  } = session;
  if (isLastSeenStale)
    await connection.query('UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1', [
      tokenHash,
    ]);
  return {
    user,
    tokenHash,
    authMethod,
    mustChangePassword,
    oidcCheckedAt: toDate(oidcCheckedAt),
    tokenExpiresAt: toDate(tokenExpiresAt),
  };
}

// IdPに問い合わせる直前に読み直し、待たされた確認が、別の確認が更新したtokenを使うようにする。
export async function findOidcSessionState(
  connection: Connection,
  tokenHash: string,
): Promise<OidcSessionState | undefined> {
  const state = await first<{
    userId: string;
    oidcIssuer: string | null;
    oidcSubject: string | null;
    tokenKeyId: string | null;
    accessTokenEnc: Buffer | null;
    refreshTokenEnc: Buffer | null;
    tokenExpiresAt: string | null;
    oidcCheckedAt: string | null;
  }>(
    connection,
    `SELECT user_id,oidc_issuer,oidc_subject,token_key_id,access_token_enc,refresh_token_enc,
      token_expires_at,oidc_checked_at
    FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`,
    [tokenHash],
  );
  if (!state) return undefined;
  return {
    tokenHash,
    userId: state.userId,
    issuer: state.oidcIssuer,
    subject: state.oidcSubject,
    tokens:
      state.tokenKeyId && state.accessTokenEnc
        ? {
            keyId: state.tokenKeyId,
            accessToken: state.accessTokenEnc,
            refreshToken: state.refreshTokenEnc,
            expiresAt: toDate(state.tokenExpiresAt),
          }
        : null,
    checkedAt: toDate(state.oidcCheckedAt),
  };
}

/**
 * 成功した再確認の結果を保存する。前回の確認時刻をバージョンとして使う。別の確認が既にtokenを
 * 置き換えていたら、この結果は捨ててfalseを返す。こうして、IdPがローテーションした
 * refresh tokenを古いもので上書きしないようにする。
 */
export async function recordOidcSessionCheck(
  connection: Connection,
  check: {
    tokenHash: string;
    previousCheckedAt: Date | null;
    tokens: EncryptedSessionTokens;
    checkedAt: Date;
  },
): Promise<boolean> {
  const updated = await connection.query(
    `UPDATE sessions SET oidc_checked_at=$3,token_key_id=$4,access_token_enc=$5,
      refresh_token_enc=$6,token_expires_at=$7
    WHERE token_hash=$1 AND revoked_at IS NULL AND oidc_checked_at IS NOT DISTINCT FROM $2`,
    [
      check.tokenHash,
      check.previousCheckedAt,
      check.checkedAt,
      check.tokens.keyId,
      check.tokens.accessToken,
      check.tokens.refreshToken,
      check.tokens.expiresAt,
    ],
  );
  return updated.rowCount === 1;
}

export async function revokeSession(connection: Connection, token: string): Promise<void> {
  await revokeSessionByHash(connection, hashSecret(token));
}

export async function revokeSessionByHash(
  connection: Connection,
  tokenHash: string,
): Promise<void> {
  await connection.query(
    `UPDATE sessions SET ${REVOKE_SET} WHERE token_hash=$1 AND revoked_at IS NULL`,
    [tokenHash],
  );
}

// SSOの利用者が持つブラウザのsessionすべて。グループから外されたときと、subを指定した
// back-channel logoutで使う。
export async function revokeOidcIdentitySessions(
  connection: Connection,
  identity: { issuer: string; subject: string },
): Promise<number> {
  const revoked = await connection.query(
    `UPDATE sessions SET ${REVOKE_SET}
    WHERE oidc_issuer=$1 AND oidc_subject=$2 AND revoked_at IS NULL`,
    [identity.issuer, identity.subject],
  );
  return revoked.rowCount ?? 0;
}

// IdPのsession idによるback-channel logout。logout tokenがsubjectを示しているときは、
// subjectでも絞り込む。
export async function revokeOidcSidSessions(
  connection: Connection,
  logout: { issuer: string; sid: string; subject: string | null },
): Promise<number> {
  const revoked = await connection.query(
    `UPDATE sessions SET ${REVOKE_SET}
    WHERE oidc_issuer=$1 AND oidc_sid=$2 AND ($3::text IS NULL OR oidc_subject=$3)
    AND revoked_at IS NULL`,
    [logout.issuer, logout.sid, logout.subject],
  );
  return revoked.rowCount ?? 0;
}

export async function revokeOtherSessions(
  connection: Connection,
  session: { userId: string; keepTokenHash: string },
): Promise<void> {
  await connection.query(
    `UPDATE sessions SET ${REVOKE_SET} WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL`,
    [session.userId, session.keepTokenHash],
  );
}

// 管理者が利用者を無効にしたときや、パスワードをリセットしたときに使う。すべてのsessionを
// すぐに終える。
export async function revokeAllForUser(connection: Connection, userId: string): Promise<void> {
  await connection.query(
    `UPDATE sessions SET ${REVOKE_SET} WHERE user_id=$1 AND revoked_at IS NULL`,
    [userId],
  );
}

// back-channel logout tokenのjtiを記録する。同じtokenを前に受け付けていたらfalse。
export async function consumeLogoutTokenId(
  connection: Connection,
  logout: { issuer: string; jti: string; now: Date; expiresAt: Date },
): Promise<boolean> {
  await connection.query('DELETE FROM oidc_logout_tokens WHERE expires_at<=$1', [logout.now]);
  const inserted = await connection.query(
    `INSERT INTO oidc_logout_tokens(issuer,jti,expires_at) VALUES($1,$2,$3)
    ON CONFLICT(issuer,jti) DO NOTHING`,
    [logout.issuer, logout.jti, logout.expiresAt],
  );
  return inserted.rowCount === 1;
}
