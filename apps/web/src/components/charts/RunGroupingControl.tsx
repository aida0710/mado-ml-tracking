import { useId } from 'react';
import type { RunGroupBy } from '@mmt/contracts';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

type GroupingKind = RunGroupBy['kind'] | 'none';

const groupingLabels: Record<GroupingKind, string> = {
  get none() { return text.chartGroupingNone; },
  get tag() { return text.chartGroupingTag; },
  get param() { return text.chartGroupingParam; },
  get experiment() { return text.chartGroupingExperiment; },
};

/**
 * Runをどうグループ化するかを選ぶ。タグ、パラメータ、Experimentのどれか。`tagKeys`と
 * `paramKeys`は一覧のRunから作った候補で、どのキーでも入力できる。
 */
export function RunGroupingControl({
  value,
  tagKeys,
  paramKeys,
  onChange,
}: {
  value: RunGroupBy | undefined;
  tagKeys: readonly string[];
  paramKeys: readonly string[];
  onChange: (value: RunGroupBy | undefined) => void;
}) {
  useLocale();
  const id = useId();
  const kind: GroupingKind = value?.kind ?? 'none';
  const suggestions = kind === 'tag' ? tagKeys : kind === 'param' ? paramKeys : [];

  function changeKind(next: GroupingKind) {
    if (next === 'none') return onChange(undefined);
    if (next === 'experiment') return onChange({ kind: 'experiment' });
    const known = next === 'tag' ? tagKeys : paramKeys;
    // タグかパラメータでのグループ化にはキーが要る。一覧のRunが持つ最初のキーから始める。
    const key = value?.kind === next ? value.key : known[0];
    onChange(key ? { kind: next, key } : { kind: next, key: '' });
  }

  return (
    <div className="run-grouping-control">
      <label className="toolbar-item" htmlFor={`${id}-kind`}>
        <span>{text.chartGrouping}</span>
        <select
          id={`${id}-kind`}
          value={kind}
          onChange={(event) => changeKind(event.target.value as GroupingKind)}
        >
          {Object.entries(groupingLabels).map(([option, label]) => (
            <option key={option} value={option}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {(kind === 'tag' || kind === 'param') && (
        <label className="toolbar-item" htmlFor={`${id}-key`}>
          <span>{text.chartGroupingKey}</span>
          <input
            id={`${id}-key`}
            list={`${id}-keys`}
            value={value?.key ?? ''}
            onChange={(event) => onChange({ kind, key: event.target.value })}
          />
          <datalist id={`${id}-keys`}>
            {suggestions.map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>
        </label>
      )}
    </div>
  );
}
