import { DEFAULT_BASELINE_ALIAS, type MetricValueStatus } from '@mmt/contracts';
import { memoizePerIntlLocale } from '../i18n/intlFormatterCache';
import { evaluationText } from '../i18n/evaluation';

// productionを優先し、無ければ名前順で最初のalias。nullならAPIが自分の既定を使う。
export function defaultBaselineAlias(aliases: Record<string, string>): string | null {
  if (Object.hasOwn(aliases, DEFAULT_BASELINE_ALIAS)) return DEFAULT_BASELINE_ALIAS;
  return Object.keys(aliases).sort()[0] ?? null;
}

const SIGNIFICANT_DIGITS = 6;
const RELATIVE_FRACTION_DIGITS = 2;

const getMetricValueFormat = memoizePerIntlLocale(
  (intlLocale) => new Intl.NumberFormat(intlLocale, { maximumSignificantDigits: SIGNIFICANT_DIGITS }),
);
// 差には常に符号を付け、減った分を値そのものと取り違えないようにする。
const getDeltaFormat = memoizePerIntlLocale(
  (intlLocale) =>
    new Intl.NumberFormat(intlLocale, {
      maximumSignificantDigits: SIGNIFICANT_DIGITS,
      signDisplay: 'exceptZero',
    }),
);
const getRelativeDeltaFormat = memoizePerIntlLocale(
  (intlLocale) =>
    new Intl.NumberFormat(intlLocale, {
      style: 'percent',
      maximumFractionDigits: RELATIVE_FRACTION_DIGITS,
      signDisplay: 'exceptZero',
    }),
);

export function formatMetricValue(value: number | null, status: MetricValueStatus): string {
  if (status === 'not_finite') return evaluationText.metricNotFinite;
  if (value === null) return '—';
  return getMetricValueFormat().format(value);
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  return getDeltaFormat().format(delta);
}

export function formatRelativeDelta(relativeDelta: number | null): string {
  if (relativeDelta === null) return '—';
  return getRelativeDeltaFormat().format(relativeDelta);
}
