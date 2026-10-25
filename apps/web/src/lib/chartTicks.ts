import { memoizePerIntlLocale } from '../i18n/intlFormatterCache';

// 図の値の軸の目盛りのラベル。軸は幅が狭いので、ラベルは10文字ほどに収める。非常に大きい数や
// 小さい数は指数表記に、バイトは2進の単位に切り替える。

/** 図の値が測るもの。システムメトリクスのパネルは単位を知っているが、ほかは知らない。 */
export type ChartValueUnit = 'number' | 'bytes' | 'bytes_per_second';

// 軸を広げずに、隣の目盛り（0.105の隣の0.0575）を見分けるのに足りる桁数。
const TICK_SIGNIFICANT_DIGITS = 4;
// この範囲の外では、ふつうの数字（100000、0.000001）が軸の幅に収まらない。
const EXPONENT_ABOVE = 1e5;
const EXPONENT_BELOW = 1e-3;
// 単位が桁の大きさを表すので3桁で足り、`1.14 MiB/s`を短く保てる。
const BYTE_TICK_SIGNIFICANT_DIGITS = 3;
// rechartsは目盛りのラベルを空白で折り返す。ノーブレークスペースなら数値と単位が離れない。
const UNIT_SEPARATOR = '\u00a0';
const BYTES_PER_BINARY_UNIT = 1024;
const BINARY_BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

// 桁区切りを入れない数字。桁区切りは軸を広げてしまう。
const memoizePlainNumberFormat = (significantDigits: number) =>
  memoizePerIntlLocale(
    (intlLocale) =>
      new Intl.NumberFormat(intlLocale, { maximumSignificantDigits: significantDigits, useGrouping: false }),
  );
const getTickNumberFormat = memoizePlainNumberFormat(TICK_SIGNIFICANT_DIGITS);
const getByteTickNumberFormat = memoizePlainNumberFormat(BYTE_TICK_SIGNIFICANT_DIGITS);

/** `1e-15`、`2.5e+7`。仮数部は有効桁数を保ち、末尾の0は落とす。 */
function exponentNumber(value: number): string {
  const [mantissa = '', exponent = ''] = value.toExponential(TICK_SIGNIFICANT_DIGITS - 1).split('e');
  const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa;
  return `${trimmed}e${exponent}`;
}

export function formatTickNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude === 0) return '0';
  return magnitude >= EXPONENT_ABOVE || magnitude < EXPONENT_BELOW
    ? exponentNumber(value)
    : getTickNumberFormat().format(value);
}

function formatTickBytes(bytes: number): string {
  const magnitude = Math.abs(bytes);
  const unitIndex =
    magnitude < 1
      ? 0
      : Math.min(
          Math.floor(Math.log(magnitude) / Math.log(BYTES_PER_BINARY_UNIT)),
          BINARY_BYTE_UNITS.length - 1,
        );
  const scaled = getByteTickNumberFormat().format(bytes / BYTES_PER_BINARY_UNIT ** unitIndex);
  return `${scaled}${UNIT_SEPARATOR}${BINARY_BYTE_UNITS[unitIndex]}`;
}

export function formatChartTick(value: number, unit: ChartValueUnit): string {
  if (unit === 'bytes') return formatTickBytes(value);
  if (unit === 'bytes_per_second') return `${formatTickBytes(value)}/s`;
  return formatTickNumber(value);
}
