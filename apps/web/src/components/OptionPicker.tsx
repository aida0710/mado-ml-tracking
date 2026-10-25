import { useId, type ReactNode } from 'react';

export interface PickerOption<T extends string> {
  value: T;
  label: ReactNode;
  /** 選択肢の意味。名前の下に出す。 */
  hint?: string;
}

/**
 * 少しの選択肢から1つを、選択肢ごとに枠線で囲んだラジオボタンの一覧で選ぶ（ブラウザのselectは
 * 使わない）。各選択肢の名前の下にその意味を、一覧の下に選択についての説明を出す。
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
  /** ラジオボタンのグループの名前。フォームの中で重複しないもの。 */
  name: string;
  legend: string;
  options: readonly PickerOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** 選択全体の説明（何を検出したか、選ぶと何が起きるか）。グループと合わせて読み上げる。 */
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
        // 選択肢の名前はラベルだけにし、説明はその選択肢の説明文として読み上げる。
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
