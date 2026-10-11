import { useId, type ReactNode } from 'react';

export interface CheckboxOption {
  value: string;
  label: ReactNode;
}

/** Several of a few options as checkboxes under a legend (no browser multi-select). */
export function CheckboxList({
  legend,
  options,
  selected,
  onToggle,
  empty,
  hint,
}: {
  legend: ReactNode;
  options: readonly CheckboxOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  /** Shown instead of the checkboxes when there are no options. */
  empty?: string;
  /** About the whole list (where the checked values came from), read with the group. */
  hint?: string;
}) {
  const hintId = useId();
  return (
    <fieldset className="checkbox-list" aria-describedby={hint ? hintId : undefined}>
      <legend>{legend}</legend>
      {options.length === 0 && empty && <span className="muted">{empty}</span>}
      {options.map((option) => (
        <label className="checkbox-field" key={option.value}>
          <input
            type="checkbox"
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
