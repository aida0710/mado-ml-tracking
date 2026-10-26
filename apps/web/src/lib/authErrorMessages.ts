import { isApiError, type ApiError } from '@mado/design-system/http';
import { formatErrorMessage } from './errorMessage';
import { text } from '../i18n/catalog';

// ログインの画面が個別の文を持たない失敗は、ほかの失敗と同じく表示言語の文で出す。
function rateLimitOr(error: unknown, fallback: (error: ApiError) => string | undefined) {
  if (!isApiError(error)) return formatErrorMessage(error);
  if (error.status === 429) return text.loginRateLimited;
  return fallback(error) ?? formatErrorMessage(error);
}

// invalid_credentials は誤った認証情報、429 は待つ必要があることを表す。画面はこれを分けて伝える。
export function localLoginErrorMessage(error: unknown): string {
  return rateLimitOr(error, (failure) =>
    failure.code === 'invalid_credentials' ? text.localLoginInvalid : undefined,
  );
}

export function changePasswordErrorMessage(error: unknown): string {
  return rateLimitOr(error, (failure) => {
    if (failure.code === 'incorrect_password') return text.currentPasswordInvalid;
    if (failure.code === 'weak_password') return text.weakPassword;
    if (failure.code === 'local_credential_unavailable') return text.localAccountRequired;
    return undefined;
  });
}
