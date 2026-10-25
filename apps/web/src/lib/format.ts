import { formatBytes as formatBytesInLocale } from '@mado/design-system/format';
import { memoizePerIntlLocale } from '../i18n/intlFormatterCache';
import { getIntlLocale } from '../i18n/locale';

const getDateTimeFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'short' }),
);
export const formatDate = (value: string | null) =>
  value ? getDateTimeFormat().format(new Date(value)) : '—';
// 同じ1分の間のログの行や最後の応答は、秒まで出さないと見分けられない。
const getDateTimeSecondsFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'short', timeStyle: 'medium' }),
);
/** ISO形式の時刻か、図の実時間のxの値のような、epochからのミリ秒。 */
export const formatDateTimeSeconds = (value: string | number | null) =>
  value === null || value === '' ? '—' : getDateTimeSecondsFormat().format(new Date(value));
// ツールチップのように単独で出すメトリクスやパラメータの値に足りる桁数。
const NUMBER_SIGNIFICANT_DIGITS = 6;
const getNumberFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.NumberFormat(intlLocale, { maximumSignificantDigits: NUMBER_SIGNIFICANT_DIGITS }),
);
export const formatNumber = (value: number) => getNumberFormat().format(value);
// 表のセルは有効数字4桁で出す。ツールチップには元の値を残す。
const TABLE_SIGNIFICANT_DIGITS = 4;
// とても小さいパラメータは指数表記にして、表のセルに収める。
const SCIENTIFIC_NOTATION_THRESHOLD = 0.0001;
// 英語なら1.2M、日本語なら120万のように、大きな数を表示言語の書き方で出す。
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

// RunのidはUUID。名前を（まだ）読み込んでいないRunは、その最初の区切りで示す。
const SHORT_RUN_ID_LENGTH = 8;
export const shortRunId = (runId: string) => runId.slice(0, SHORT_RUN_ID_LENGTH);
