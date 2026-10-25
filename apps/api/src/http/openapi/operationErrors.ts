import { jobTokenAccessOf } from '../jobTokenGuard.js';
import { isNonJsonContent, routeError, type NativeRoute, type RouteError } from './nativeRoute.js';

/**
 * ある種類のすべての経路が返しうるエラー。アクセス、入力、共有のmiddleware（app.ts、
 * authMiddleware.ts、jobTokenGuard.ts）から導き、カタログにはその経路に固有のエラーだけを
 * 挙げる。
 */
export function genericErrorsOf(route: NativeRoute): RouteError[] {
  const errors: RouteError[] = [];
  const { access } = route;
  const usesInput =
    route.body !== undefined || route.query !== undefined || route.path.includes(':');
  if (route.body !== undefined && !isNonJsonContent(route.body))
    errors.push(...routeError(400, 'invalid_json'), ...routeError(413, 'body_too_large'));
  if (usesInput) errors.push(...routeError(422, 'invalid_request'));
  if (access.kind !== 'public') {
    errors.push(
      ...routeError(401, 'authentication_required', 'invalid_token', 'basic_auth_unsupported'),
    );
    errors.push(...routeError(403, 'password_change_required'));
    if (route.method !== 'get') errors.push(...routeError(403, 'invalid_origin'));
    // SSOのsessionはIdPのUserInfoで確かめ直す。IdPに届かなければ通さない側に倒す。
    errors.push(...routeError(503, 'oidc_unavailable'));
  }
  const isSessionOnly = access.kind === 'session' || ('sessionOnly' in access && access.sessionOnly);
  if (isSessionOnly) errors.push(...routeError(403, 'session_required'));
  // SSOユーザーのAPI tokenは、そのユーザーのグループの同期が許される古さを超えると止まる。
  else if (access.kind !== 'public') errors.push(...routeError(401, 'identity_sync_required'));
  if (access.kind === 'signedIn' || access.kind === 'project' || access.kind === 'globalAdmin')
    errors.push(...routeError(403, 'scope_required'));
  // project_archived: アーカイブしたProjectを、そのメンバーか全体管理者が開いたとき。
  if (access.kind === 'project')
    errors.push(
      ...routeError(403, 'project_forbidden'),
      ...routeError(404, 'not_found', 'project_archived'),
    );
  if (access.kind === 'globalAdmin') errors.push(...routeError(403, 'admin_required'));
  if (access.kind === 'worker') errors.push(...routeError(403, 'worker_token_required'));
  if (access.kind === 'launcher') errors.push(...routeError(403, 'launcher_token_required'));
  if (access.kind === 'apiToken')
    errors.push(...routeError(403, 'api_token_required', 'scope_required'));
  if (access.kind !== 'public' && jobTokenAccess(route) !== 'read')
    errors.push(...routeError(403, 'job_token_forbidden'));
  if (route.method !== 'get')
    errors.push(...routeError(409, 'already_exists'), ...routeError(422, 'invalid_reference'));
  errors.push(...routeError(503, 'internal_error'));
  return errors;
}

/** 経路に固有のエラーを先に、続いて一般的なものを、ステータスとコードの重複なしで並べる。 */
export function errorsOf(route: NativeRoute): RouteError[] {
  const seen = new Set<string>();
  return [...(route.errors ?? []), ...genericErrorsOf(route)].filter((error) => {
    const key = `${error.status} ${error.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Job token（mado_mtj_）でその route に届くか。'read' と 'write' は jobTokenGuard の許可表に従い
 * （'write' でも token 自身の Run に限る）、null は 403 job_token_forbidden。
 */
export function jobTokenAccess(route: NativeRoute): 'read' | 'write' | null {
  if (route.access.kind === 'public' || route.access.kind === 'session') return null;
  return jobTokenAccessOf(route.method.toUpperCase(), route.path);
}
