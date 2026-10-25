import { useId, useState, type ReactNode } from 'react';
import { filterCheckboxOptions, type CheckboxOption } from '../lib/checkboxOptions';
import { isEnterOutsideComposition } from '../lib/imeComposition';

// この数までのチェックボックスはひと目で読める。これより長い一覧には上に絞り込みの欄を付ける。
const FILTERABLE_OPTION_COUNT = 8;

/** 少しの選択肢から複数を選ぶ、legendの下のチェックボックス（ブラウザの複数選択は使わない）。 */
export function CheckboxList({
  legend,
  options,
  selected,
  onToggle,
  empty,
  hint,
  filterLabel,
}: {
  legend: ReactNode;
  options: readonly CheckboxOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  /** 選択肢が無いとき、チェックボックスの代わりに表示する。 */
  empty?: string;
  /** 一覧全体についての説明（チェック済みの値の出どころなど）。グループと合わせて読み上げる。 */
  hint?: string;
  /** 長い一覧の上に出す絞り込みの欄の名前。渡さなければ、常にすべての選択肢を並べる。 */
  filterLabel?: string;
}) {
  const hintId = useId();
  const [query, setQuery] = useState('');
  const isFilterable = Boolean(filterLabel) && options.length > FILTERABLE_OPTION_COUNT;
  const shownOptions = isFilterable ? filterCheckboxOptions({ options, selected, query }) : options;
  return (
    <fieldset className="checkbox-list" aria-describedby={hint ? hintId : undefined}>
      <legend>{legend}</legend>
      {options.length === 0 && empty && <span className="muted">{empty}</span>}
      {isFilterable && (
        <input
          type="search"
          className="checkbox-list-filter"
          aria-label={filterLabel}
          placeholder={filterLabel}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // この一覧はダイアログのフォーム（フォルダのアップロード、新しいルールやフック）の
            // 中にあり、利用者が一覧を絞り込んでいるだけでもEnterでフォームを送信してしまう。
            if (isEnterOutsideComposition(event)) event.preventDefault();
          }}
        />
      )}
      {shownOptions.map((option) => (
        <label className="checkbox-field" key={option.value}>
          <input
            type="checkbox"
            value={option.value}
            checked={selected.includes(option.value)}
            onChange={() => onToggle(option.value)}
          />
          {option.label}
        </label>
      ))}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
