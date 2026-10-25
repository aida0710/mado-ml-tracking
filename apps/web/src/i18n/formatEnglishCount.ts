import { intlLocaleOf } from '@mado/design-system/locale';

/** English count labels share number grouping and singular/plural handling. */
export function formatEnglishCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString(intlLocaleOf('en'))} ${count === 1 ? singular : plural}`;
}
