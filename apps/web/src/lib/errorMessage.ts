import { ApiError, INVALID_RESPONSE_CODE, NETWORK_ERROR_CODE } from '@mado/design-system/http';
import { ARTIFACT_TOO_LARGE_CODE } from '../api/http';
import { LocalizedError } from './localizedError';
import { text } from '../i18n/catalog';

/*
 * APIの失敗は、どちらの言語の画面でもAPIの文（ApiErrorのmessage）をそのまま出す。APIの文が無い、
 * 画面の側で起きた失敗だけを、表示言語の文にする。
 */
const screenErrorText: Record<string, () => string> = {
  [NETWORK_ERROR_CODE]: () => text.requestError,
  [INVALID_RESPONSE_CODE]: () => text.invalidResponse,
  [ARTIFACT_TOO_LARGE_CODE]: () => text.artifactTooLarge,
};

/** 失敗を画面に出す文にする。 */
export function formatErrorMessage(failure: unknown): string {
  if (failure instanceof ApiError) return (failure.code && screenErrorText[failure.code]?.()) || failure.message;
  if (failure instanceof LocalizedError) return failure.getLocalizedMessage();
  if (failure instanceof Error) return failure.message;
  return String(failure);
}
