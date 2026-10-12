import { RequestError } from '../api/http';
import { formatErrorMessage } from './errorMessage';
import { text } from '../i18n/catalog';

// Failures the sign-in screens do not name themselves read like any other failure, in the display language.
function rateLimitOr(error: unknown, fallback: (error: RequestError) => string | undefined) {
  if (!(error instanceof RequestError)) return formatErrorMessage(error);
  if (error.status === 429) return text.loginRateLimited;
  return fallback(error) ?? formatErrorMessage(error);
}

// 401 means wrong credentials and 429 means waiting is required; the screen tells them apart.
export function localLoginErrorMessage(error: unknown): string {
  return rateLimitOr(error, (failure) =>
    failure.status === 401 ? text.localLoginInvalid : undefined,
  );
}

export function changePasswordErrorMessage(error: unknown): string {
  return rateLimitOr(error, (failure) => {
    if (failure.status === 401) return text.currentPasswordInvalid;
    if (failure.code === 'weak_password') return text.weakPassword;
    if (failure.code === 'local_account_required') return text.localAccountRequired;
    return undefined;
  });
}
