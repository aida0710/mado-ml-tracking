import type { ApiErrorCode } from '@mmt/contracts';
import type { ApiError } from '@mado/design-system/http';
import { japaneseApiErrorLeads, japaneseApiErrorMessages } from '../i18n/apiErrors';
import { getLocale } from '../i18n/locale';
import { formatNote } from '../i18n/textJoining';

function isTranslatedCode(code: string): code is ApiErrorCode {
  return Object.hasOwn(japaneseApiErrorMessages, code) || Object.hasOwn(japaneseApiErrorLeads, code);
}

/**
 * API のエラーを今の言語の文にする。英語の画面は API の英語の文をそのまま出す。日本語の画面は code から
 * 訳し、辞書に無い code は API の英語の文を出す。API の文が無い（API の形でない応答）なら null を返し、
 * 呼び出し側が文を選ぶ。
 */
export function apiErrorMessage(failure: ApiError): string {
  const serverMessage = failure.message;
  if (getLocale() === 'en' || !failure.code || !isTranslatedCode(failure.code)) return serverMessage;
  const lead = japaneseApiErrorLeads[failure.code];
  if (lead) return `${lead}${formatNote(serverMessage)}`;
  const translation = japaneseApiErrorMessages[failure.code]!;
  return typeof translation === 'string' ? translation : translation(failure.details);
}
