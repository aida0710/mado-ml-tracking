import type { ReactNode } from 'react';

export interface CheckboxOption {
  value: string;
  label: ReactNode;
  /** 絞り込みの欄が照合する文字。省いたときは文字列のラベルを使う。 */
  searchText?: string;
}

function searchTextOf(option: CheckboxOption): string {
  return option.searchText ?? (typeof option.label === 'string' ? option.label : option.value);
}

/**
 * 文字に`query`を含む選択肢（大文字と小文字は区別しない）。チェックした選択肢は常に残し、
 * 選んだものが絞り込みで見えなくならないようにする。
 */
export function filterCheckboxOptions({
  options,
  selected,
  query,
}: {
  options: readonly CheckboxOption[];
  selected: readonly string[];
  query: string;
}): CheckboxOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...options];
  return options.filter(
    (option) =>
      selected.includes(option.value) || searchTextOf(option).toLowerCase().includes(needle),
  );
}
