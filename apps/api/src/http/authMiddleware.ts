import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AuthService } from '../services/authService.js';
import type { JobTokenService } from '../services/jobTokenService.js';
import { isJobToken } from '../auth/jobTokens.js';
import { DomainError } from '../domain/errors.js';
import { isMlflowRequest } from '../mlflow/errors.js';
import type { ApiEnvironment } from './request.js';
import { isAllowedOrigin, type OriginPolicy } from './originPolicy.js';

export const SESSION_COOKIE = 'mmt_session';
export const LOGIN_BINDING_COOKIE = 'mmt_login_binding';

// パスワードの変更が必要なsessionにできるのは、自分が誰かを読む・パスワードを変える・
// ログアウトすることだけ。
const PASSWORD_CHANGE_ALLOWED_REQUESTS = new Set([
  'GET /api/auth/config',
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'POST /api/auth/logout',
]);

export function validateOrigin(origin: string | undefined, policy: OriginPolicy): void {
  if (!isAllowedOrigin(origin, policy))
    throw new DomainError({
      status: 403,
      code: 'invalid_origin',
      message: 'the request origin is not allowed',
    });
}

// API token（mado_mt_）と Job token（mado_mtj_）は、前置きと乱数の base64url。この形でない値は
// DB を引かずに断る。
const API_TOKEN_FORMAT = /^mado_mtj?_[A-Za-z0-9_-]+$/;

/**
 * AuthorizationヘッダーからAPI tokenを読む。Bearerはどこでも使える。BasicはMLflowのAPIでだけ
 * 受け付ける。MLFLOW_TRACKING_USERNAME/PASSWORDを設定した社内のツールがBasicで送ってくるため。
 * パスワードはAPI tokenでなければならず、ユーザー名は無視する。ローカルアカウントのパスワードは
 * 決して受け付けないので、Basicでパスワードを推測することはできない。
 */
export function apiTokenFromAuthorization(
  authorization: string,
  request: { path: string },
): string {
  const bearer = /^Bearer (\S+)$/.exec(authorization);
  if (bearer) {
    if (!API_TOKEN_FORMAT.test(bearer[1]!))
      throw new DomainError({
        status: 401,
        code: 'invalid_token',
        message: 'invalid Authorization header',
      });
    return bearer[1]!;
  }
  const basic = /^Basic ([A-Za-z0-9+/]+=*)$/i.exec(authorization);
  if (!basic) throw new DomainError({
    status: 401,
    code: 'invalid_token',
    message: 'invalid Authorization header',
  });
  if (!isMlflowRequest(request.path))
    throw new DomainError({
      status: 401,
      code: 'basic_auth_unsupported',
      message: 'Basic authentication works only on the MLflow-compatible API; use a Bearer token',
    });
  const credentials = Buffer.from(basic[1]!, 'base64').toString('utf8');
  const separator = credentials.indexOf(':');
  const password = separator < 0 ? '' : credentials.slice(separator + 1);
  if (!API_TOKEN_FORMAT.test(password))
    throw new DomainError({
      status: 401,
      code: 'invalid_token',
      message: 'use an API token as the Basic authentication password',
    });
  return password;
}

// jobTokensが無いとき（APIの一部だけを載せるテストのfixture）は、Job tokenを拒む。
export function authentication(
  auth: AuthService,
  jobTokens?: JobTokenService,
): MiddlewareHandler<ApiEnvironment> {
  return async (context, next) => {
    const authorization = context.req.header('Authorization');
    const apiToken = authorization
      ? apiTokenFromAuthorization(authorization, context.req)
      : undefined;
    const session = getCookie(context, SESSION_COOKIE);
    const identity =
      apiToken && isJobToken(apiToken)
        ? await authenticateJobToken(jobTokens, apiToken)
        : await auth.authenticate({ bearer: apiToken, session });
    context.set('principal', identity);
    if (session && !apiToken && !['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      validateOrigin(context.req.header('Origin'), auth.config);
    }
    if (
      identity?.session?.mustChangePassword &&
      !PASSWORD_CHANGE_ALLOWED_REQUESTS.has(`${context.req.method} ${context.req.path}`)
    )
      throw new DomainError({
        status: 403,
        code: 'password_change_required',
        message: 'change your password before continuing',
      });
    await next();
  };
}

function authenticateJobToken(jobTokens: JobTokenService | undefined, bearer: string) {
  if (!jobTokens) throw new DomainError({
    status: 401,
    code: 'invalid_token',
    message: 'Job tokens cannot be used here',
  });
  return jobTokens.authenticate(bearer);
}
