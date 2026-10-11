import { text } from '../../i18n/catalog';

/** A labelled select of names for an embed setting; the empty value means "not chosen". */
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
