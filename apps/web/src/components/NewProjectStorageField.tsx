import { useState } from 'react';
import { StorageBackendPicker } from './StorageBackendPicker';
import type { StorageBackendChoice } from '../hooks/useStorageBackends';
import { useLocale } from '../i18n/useLocale';
import { text, textTemplates } from '../i18n/catalog';

/**
 * 新しいProjectがArtifactを保存する場所。登録された名前だけでは初めての人がどれを選べばよいか
 * 分からないので、全体管理者が選んだ既定を明記し、ほかの保存先は開閉できる欄の中に控えさせる。
 * ほかの保存先を選んでいるときは、最初から開いておく。
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
  // 最初の描画で決めておき、既定を選び直しても一覧が畳まれないようにする。
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
