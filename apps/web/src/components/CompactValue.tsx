import { formatCompactNumber, formatValue } from '../lib/format';
import { useLocale } from '../i18n/useLocale';

export function CompactValue({ value }: { value: unknown }) {
  useLocale();
  return (
    <span className="compact-value" title={formatValue(value)}>
      {typeof value === 'number' ? formatCompactNumber(value) : formatValue(value)}
    </span>
  );
}
