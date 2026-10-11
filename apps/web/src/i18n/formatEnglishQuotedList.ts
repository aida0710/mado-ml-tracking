import { INTL_LOCALES } from './locale';
import { getListFormat } from './textJoining';

/**
 * Names quoted the way English messages quote them, listed as a sentence lists them: “a”, “b”, and
 * “c”. For the English catalogs, which build English text whatever the caller's language.
 */
export function formatEnglishQuotedList(names: readonly string[]): string {
  return getListFormat(INTL_LOCALES.en).format(names.map((name) => `“${name}”`));
}
