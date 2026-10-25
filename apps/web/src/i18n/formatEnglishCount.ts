import { intlLocaleOf } from '@mado/design-system/locale';

/** 英語の件数の文言で、数の桁区切りと単数・複数の扱いを共通にする。 */
export function formatEnglishCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString(intlLocaleOf('en'))} ${count === 1 ? singular : plural}`;
}
