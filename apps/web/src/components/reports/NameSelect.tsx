import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

/** 埋め込みの設定に使う、ラベル付きの名前のselect。空の値は「選んでいない」を表す。 */
export function NameSelect({
  label,
  value,
  options,
  noneLabel = text.none,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ key: string; label: string }>;
  noneLabel?: string;
  onChange: (value: string) => void;
}) {
  useLocale();
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{noneLabel}</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
