import { INTL_LOCALES } from './locale';

/** English count labels share number grouping and singular/plural handling. */
export function formatEnglishCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString(INTL_LOCALES.en)} ${count === 1 ? singular : plural}`;
}
