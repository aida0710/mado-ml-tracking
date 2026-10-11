import { useId, type ReactNode } from 'react';

/**
 * A labelled control in a hand-built form (one FormFields cannot describe, such as a field that
 * depends on another). `children` renders the control with the id the label points at, and the id
 * of the hint to read with it when there is one.
 */
export function LabeledField({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: (id: string, hintId: string | undefined) => ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children(id, hint ? hintId : undefined)}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
