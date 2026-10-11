import { useLocale } from '../i18n/useLocale';
import { useState } from 'react';
import { StorageBackendPicker } from './StorageBackendPicker';
import type { StorageBackendChoice } from '../hooks/useStorageBackends';
import { text, textTemplates } from '../i18n/catalog';

/**
 * Where a new Project stores Artifacts. The registered names alone do not tell a newcomer which to
 * pick, so the default the global administrator chose is stated and the other backends wait
 * behind a disclosure, opened already when one of them is chosen.
 */
export function NewProjectStorageField({
  choices,
  defaultBackend,
  value,
  onChange,
}: {
  choices: StorageBackendChoice[];
  defaultBackend: string;
  value: string;
  onChange: (backend: string) => void;
}) {
  useLocale();
  // Fixed at the first render, so choosing the default again does not fold the list away.
  const [isOpenAtStart] = useState(value !== defaultBackend);
  const picker = (
    <StorageBackendPicker
      name="new-project-artifact-backend"
      choices={choices}
      defaultBackend={defaultBackend}
      value={value}
      onChange={onChange}
    />
  );
  if (choices.length <= 1) return picker;
  return (
    <div className="field new-project-storage">
      <span>{text.storage}</span>
      <p className="field-note">{textTemplates.newProjectStorageDefault(defaultBackend)}</p>
      <details className="connection-more" open={isOpenAtStart || undefined}>
        <summary>{text.newProjectStorageOthers}</summary>
        {picker}
        <p className="field-hint">{text.newProjectStorageHint}</p>
      </details>
    </div>
  );
}
