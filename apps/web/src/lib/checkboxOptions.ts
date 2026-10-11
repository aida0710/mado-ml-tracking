import type { ReactNode } from 'react';

export interface CheckboxOption {
  value: string;
  label: ReactNode;
  /** What the filter box matches; a plain-text label is used when this is left out. */
  searchText?: string;
}

function searchTextOf(option: CheckboxOption): string {
  return option.searchText ?? (typeof option.label === 'string' ? option.label : option.value);
}

/**
 * The options whose text contains `query` (ignoring letter case). Checked options always stay, so
 * what is chosen never disappears behind the filter.
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
