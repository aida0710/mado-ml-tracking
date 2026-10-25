import { formatRelativeTime as formatRelativeTimeInLocale } from '@mado/design-system/format';
import { getIntlLocale } from '../i18n/locale';

/** 「今」「5分前」「昨日」などを今の表示言語で。`now`から測る（デザインシステムのformatRelativeTime）。 */
export const formatRelativeTime = (value: string, now: number = Date.now()): string =>
  formatRelativeTimeInLocale(value, { intlLocale: getIntlLocale(), now });
