import { RequestError } from '../api/http';
import { formatErrorMessage } from './errorMessage';
import { text } from '../i18n/catalog';

// Failures the sign-in screens do not name themselves read like any other failure, in the display language.
function rateLimitOr(error: unknown, fallback: (error: RequestError) => string | undefined) {
  if (!(error instanceof RequestError)) return formatErrorMessage(error);
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
