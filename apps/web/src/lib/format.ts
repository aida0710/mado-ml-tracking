import { memoizePerIntlLocale } from '../i18n/intlFormatterCache';

const getDateTimeFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'short' }),
);
export const formatDate = (value: string | null) =>
  value ? getDateTimeFormat().format(new Date(value)) : '—';
// Log lines and last answers within the same minute need the seconds to tell them apart.
const getDateTimeSecondsFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'medium' }),
);
export const formatDateTimeSeconds = (value: string | null) =>
  value ? getDateTimeSecondsFormat().format(new Date(value)) : '—';
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
// The divisor is binary, so the displayed units must be KiB/MiB rather than KB/MB.
const BYTES_PER_BINARY_UNIT = 1024;
const BINARY_BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
// One decimal place in every unit above bytes, so sizes in a column and "sent / total" line up.
const BYTE_UNIT_FRACTION_DIGITS = 1;
const byteUnitNumber = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: BYTE_UNIT_FRACTION_DIGITS,
  maximumFractionDigits: BYTE_UNIT_FRACTION_DIGITS,
});
const roundToShownDigits = (value: number) =>
  Math.round(value * 10 ** BYTE_UNIT_FRACTION_DIGITS) / 10 ** BYTE_UNIT_FRACTION_DIGITS;
export function formatBytes(bytes: number): string {
  let unitIndex = Math.min(
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(BYTES_PER_BINARY_UNIT)),
    BINARY_BYTE_UNITS.length - 1,
  );
  if (unitIndex === 0) return `${Math.round(bytes)} B`;
  // 1023.96 KiB would round to "1024.0 KiB"; it reads as 1.0 MiB instead.
  if (roundToShownDigits(bytes / BYTES_PER_BINARY_UNIT ** unitIndex) >= BYTES_PER_BINARY_UNIT)
    unitIndex = Math.min(unitIndex + 1, BINARY_BYTE_UNITS.length - 1);
  return `${byteUnitNumber.format(bytes / BYTES_PER_BINARY_UNIT ** unitIndex)} ${BINARY_BYTE_UNITS[unitIndex]}`;
}
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
