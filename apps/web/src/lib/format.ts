import { formatBytes as formatBytesInLocale } from '@mado/design-system/format';
import { memoizePerIntlLocale } from '../i18n/intlFormatterCache';
import { getIntlLocale } from '../i18n/locale';

const getDateTimeFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'short' }),
);
export const formatDate = (value: string | null) =>
  value ? getDateTimeFormat().format(new Date(value)) : '—';
// Log lines and last answers within the same minute need the seconds to tell them apart.
const getDateTimeSecondsFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'medium' }),
);
/** An ISO time, or epoch milliseconds such as a chart's wall-clock x value. */
export const formatDateTimeSeconds = (value: string | number | null) =>
  value === null || value === '' ? '—' : getDateTimeSecondsFormat().format(new Date(value));
// Enough digits for a metric or parameter value shown on its own, such as in a tooltip.
const NUMBER_SIGNIFICANT_DIGITS = 6;
const getNumberFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.NumberFormat(intlLocale, { maximumSignificantDigits: NUMBER_SIGNIFICANT_DIGITS }),
);
export const formatNumber = (value: number) => getNumberFormat().format(value);
// Table cells use four significant digits; their tooltip retains the original value.
const TABLE_SIGNIFICANT_DIGITS = 4;
// Scientific notation keeps very small parameters within a table cell.
const SCIENTIFIC_NOTATION_THRESHOLD = 0.0001;
// 1.2M in English and 120万 in Japanese, the display language's own way of writing large numbers.
const getCompactNumberFormat = memoizePerIntlLocale(
  (intlLocale) =>
    new Intl.NumberFormat(intlLocale, { maximumSignificantDigits: TABLE_SIGNIFICANT_DIGITS, notation: 'compact' }),
);
const getScientificNumberFormat = memoizePerIntlLocale(
  (intlLocale) =>
    new Intl.NumberFormat(intlLocale, { maximumSignificantDigits: TABLE_SIGNIFICANT_DIGITS, notation: 'scientific' }),
);
export const formatCompactNumber = (value: number) =>
  value !== 0 && Math.abs(value) < SCIENTIFIC_NOTATION_THRESHOLD
    ? getScientificNumberFormat().format(value)
    : getCompactNumberFormat().format(value);
/** バイト数を今の表示言語で（"1.5 MiB"）。1024で割り、2進の単位で書く（デザインシステムのformatBytes）。 */
export const formatBytes = (bytes: number): string => formatBytesInLocale(bytes, getIntlLocale());
export function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const seconds = Math.max(
    0,
    Math.floor(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 1000),
  );
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function formatValue(value: unknown): string {
  return value === null || value === undefined
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
}

// Run ids are UUIDs; their first block names a Run whose name is not loaded (yet).
const SHORT_RUN_ID_LENGTH = 8;
export const shortRunId = (runId: string) => runId.slice(0, SHORT_RUN_ID_LENGTH);
