// SSOの往復で、このタブのブックマークしたProjectやRunのURLが失われないようにする。
const AUTH_RETURN_PATH_KEY = 'mmt.auth-return-path';

export function rememberAuthReturnPath(path: string) {
  if (!path.startsWith('/projects/')) return;
  try {
    sessionStorage.setItem(AUTH_RETURN_PATH_KEY, path);
  } catch {
    /* セッションストレージが使えなくてもログインはできる。 */
  }
}

export function takeAuthReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
    sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
    return path?.startsWith('/projects/') ? path : null;
  } catch {
    return null;
  }
}
