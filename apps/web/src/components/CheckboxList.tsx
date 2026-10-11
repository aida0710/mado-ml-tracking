import { useId, useState, type ReactNode } from 'react';
import { filterCheckboxOptions, type CheckboxOption } from '../lib/checkboxOptions';
import { isEnterOutsideComposition } from '../lib/imeComposition';

// Up to this many checkboxes are read at a glance; a longer list gets a filter box above it.
const FILTERABLE_OPTION_COUNT = 8;

/** Several of a few options as checkboxes under a legend (no browser multi-select). */
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
  /** Shown instead of the checkboxes when there are no options. */
  empty?: string;
  /** About the whole list (where the checked values came from), read with the group. */
  hint?: string;
  /** Names the filter box offered above a long list; without it every option is always listed. */
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
            // The list sits in dialog forms (a folder upload, a new rule or hook), where Enter
            // would submit the form while the person is only narrowing the list.
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
