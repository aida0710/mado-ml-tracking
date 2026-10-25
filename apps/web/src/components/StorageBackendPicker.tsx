import type { StorageBackendChoice } from '../hooks/useStorageBackends';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Projectの保存先を、名前、種類、既定かどうかを示す一覧から選ぶ。選択肢に無い今の値（無効にした
 * 保存先など）も一覧に残し、ほかの設定を保存したときにProjectの保存先が黙って移らないようにする。
 */
export function StorageBackendPicker({
  name,
  choices,
  defaultBackend,
  value,
  onChange,
}: {
  name: string;
  choices: StorageBackendChoice[];
  defaultBackend: string;
  value: string;
  onChange: (backend: string) => void;
}) {
  useLocale();
  const listed =
    choices.some((choice) => choice.name === value) || !value
      ? choices
      : [...choices, { name: value }];
  return (
    <fieldset className="choice-picker">
      <legend>{text.storage}</legend>
      {listed.map((choice) => (
        <label key={choice.name} className="choice-picker-option">
          <input
            type="radio"
            name={name}
            value={choice.name}
            checked={choice.name === value}
            onChange={() => onChange(choice.name)}
          />
          <span className="storage-picker-name">{choice.name}</span>
          {choice.kind && <span className="status-badge status-neutral">{text[choice.kind]}</span>}
          {choice.name === defaultBackend && (
            <span className="status-badge status-accent">{text.storageDefault}</span>
          )}
        </label>
      ))}
    </fieldset>
  );
}
