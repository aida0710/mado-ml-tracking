import { useId, useState } from 'react';
import { SAVED_VIEW_NAME_MAX_LENGTH, type SavedViewVisibility } from '@mmt/contracts';
import { Dialog } from '../Dialog';
import { ErrorNotice } from '../Feedback';
import { useMutation } from '../../hooks/useMutation';
import { useLocale } from '../../i18n/useLocale';
import { text } from '../../i18n/catalog';

const visibilityLabels: Record<SavedViewVisibility, { label: string; hint: string }> = {
  private: { get label() { return text.savedViewVisibilityPrivate; }, get hint() { return text.savedViewVisibilityPrivateHint; } },
  project: { get label() { return text.savedViewVisibilityProject; }, get hint() { return text.savedViewVisibilityProjectHint; } },
};

/**
 * ビューの名前と公開範囲。「名前を付けて保存」と名前の変更に使う。`visibilityChoices`は利用者が
 * 選べるもので、2つ未満なら選択を出さずに`initialVisibility`のままにする。
 */
export function SaveViewDialog<T>({
  title,
  initialName,
  initialVisibility,
  visibilityChoices,
  onSubmit,
  onSaved,
  onClose,
}: {
  title: string;
  initialName: string;
  initialVisibility: SavedViewVisibility;
  visibilityChoices: SavedViewVisibility[];
  onSubmit: (values: { name: string; visibility: SavedViewVisibility }) => Promise<T>;
  onSaved: (saved: T) => void;
  onClose: () => void;
}) {
  useLocale();
  const id = useId();
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [nameError, setNameError] = useState<string | null>(null);
  const mutation = useMutation();
  return (
    <Dialog title={title} onClose={onClose} dismissible={!mutation.pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          setNameError(trimmed ? null : text.required);
          if (!trimmed) return;
          void mutation
            .run(async () => ({ saved: await onSubmit({ name: trimmed, visibility }) }))
            .then((result) => {
              if (result) onSaved(result.saved);
            });
        }}
      >
        <fieldset disabled={mutation.pending}>
          <div className="field">
            <label htmlFor={`${id}-name`}>
              {text.savedViewName}
              <span className="required">*</span>
            </label>
            <input
              id={`${id}-name`}
              value={name}
              maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {visibilityChoices.length > 1 && (
            <fieldset className="saved-view-visibility">
              <legend>{text.savedViewVisibility}</legend>
              {visibilityChoices.map((choice) => (
                <label key={choice}>
                  <input
                    type="radio"
                    name={`${id}-visibility`}
                    value={choice}
                    checked={visibility === choice}
                    onChange={() => setVisibility(choice)}
                  />
                  <span>
                    {visibilityLabels[choice].label}
                    <small>{visibilityLabels[choice].hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </fieldset>
        <ErrorNotice message={nameError ?? mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending}>
            {mutation.pending ? text.loading : text.save}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
