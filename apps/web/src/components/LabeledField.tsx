import { useId, type ReactNode } from 'react';

/**
 * 手で組んだフォームの、ラベル付きの入力（別の欄に依存する欄など、FormFieldsで表せないもの）。
 * `children`は、ラベルが指すidと、説明があればそれを一緒に読み上げるためのidで入力を描く。
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
