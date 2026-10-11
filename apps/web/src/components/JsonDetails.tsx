import { useLocale } from '../i18n/useLocale';
import type { ReactNode } from 'react';
import { formatValue } from '../lib/format';

export function JsonDetails({ value }: { value: unknown }) {
  useLocale();
  return <pre className="json-view">{JSON.stringify(value, null, 2)}</pre>;
}
export function DetailsList({ entries }: { entries: Array<[string, ReactNode]> }) {
  useLocale();
  return (
    <dl className="details-list">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
export function KeyValues({ values }: { values: Record<string, unknown> }) {
  useLocale();
  return (
    <DetailsList
      entries={Object.entries(values).map(([label, value]) => [
        label,
        <span className="mono">{formatValue(value)}</span>,
      ])}
    />
  );
}
