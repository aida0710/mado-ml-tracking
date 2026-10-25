import { intlLocaleOf } from '@mado/design-system/locale';
import { getListFormat } from './textJoining';

/**
 * 名前を英語の文言と同じ引用符で囲み、文の中の列挙の形で並べる（“a”, “b”, and “c”）。
 * 呼び出し側の言語にかかわらず英語の文を組み立てる、英語のカタログのためのもの。
 */
export function formatEnglishQuotedList(names: readonly string[]): string {
  return getListFormat(intlLocaleOf('en')).format(names.map((name) => `“${name}”`));
}
