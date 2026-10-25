import type { User } from '@mmt/contracts';
import { text } from '../i18n/catalog';

/** SSOのユーザーは、ログインのたびに全体のロールと表示名をAuthentikから受け取る。 */
export function isSsoUser(user: Pick<User, 'authSources'>): boolean {
  return user.authSources.includes('oidc');
}

/**
 * ユーザーの一覧とアカウントの画面に出すログイン方法。Service Accountはログイン方法を持たず、
 * tokenでだけ操作する。開発用のログインはどちらも持たず、Service Accountでもない。
 */
export function userAuthSourceLabels(user: Pick<User, 'authSources' | 'kind'>): string[] {
  if (user.kind === 'service') return [text.userAuthServiceToken];
  if (user.authSources.length === 0) return [text.userAuthNone];
  return user.authSources.map((source) =>
    source === 'local' ? text.userAuthLocal : text.userAuthSso,
  );
}
