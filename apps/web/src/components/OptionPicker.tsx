import { useId, type ReactNode } from 'react';

export interface PickerOption<T extends string> {
  value: T;
  label: ReactNode;
  /** What the choice means, under its name. */
  hint?: string;
}

/**
 * Chooses one of a few options from a radio list with a bordered line per option (no browser
 * select), each with what it means under its name, and a hint about the choice under the list.
 */
export function OptionPicker<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled,
  hint,
  className = '',
}: {
  /** The radio group's name, unique in the form. */
  name: string;
  legend: string;
  options: readonly PickerOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** About the whole choice (what was detected, what the choice does), read with the group. */
  hint?: string;
  className?: string;
}) {
  const hintId = useId();
  return (
    <fieldset
      className={`choice-picker ${className}`.trim()}
      disabled={disabled}
      aria-describedby={hint ? hintId : undefined}
    >
      <legend>{legend}</legend>
      {options.map((option, index) => {
        // The option's name is its label alone; its hint is read as a description of it.
        const labelId = `${hintId}-${index}-label`;
        const optionHintId = `${hintId}-${index}-hint`;
        return (
          <label key={option.value} className="choice-picker-option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              aria-labelledby={option.hint === undefined ? undefined : labelId}
              aria-describedby={option.hint === undefined ? undefined : optionHintId}
              onChange={() => onChange(option.value)}
            />
            {option.hint === undefined ? (
              option.label
            ) : (
              <span className="choice-picker-text">
                <span id={labelId} className="choice-picker-label">
                  {option.label}
                </span>
                <span id={optionHintId} className="muted">
                  {option.hint}
                </span>
              </span>
            )}
          </label>
        );
      })}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
