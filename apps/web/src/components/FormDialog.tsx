import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { FormFields } from './FormFields';
import { createInitialValues } from '../lib/formValues';
import type { FormField } from '../types/form';
import { ErrorNotice } from './Feedback';
import { useMutation } from '../hooks/useMutation';
import type { FormValues } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

export function FormDialog<T>({
  title,
  fields,
  onSubmit,
  onSaved,
  onClose,
  submitLabel = text.save,
  description,
  notice,
}: {
  title: string;
  fields: FormField[];
  onSubmit: (values: FormValues) => Promise<T>;
  onSaved: (value: T) => void;
  onClose: () => void;
  submitLabel?: string;
  /** 欄の上に出す、フォームの目的と保存した後に起きること。 */
  description?: ReactNode;
  /** 入力に応じて欄の下に出す注記（たとえば選んだ種類によるもの）。 */
  notice?: (values: FormValues) => ReactNode;
}) {
  useLocale();
  const [values, setValues] = useState(() => createInitialValues(fields));
  const mutation = useMutation();
  return (
    <Dialog title={title} onClose={onClose} dismissible={!mutation.pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void mutation
            .run(async () => ({ saved: await onSubmit(values) }))
            .then((saved) => {
              if (saved) onSaved(saved.saved);
            });
        }}
      >
        {description && <p className="notice">{description}</p>}
        <fieldset disabled={mutation.pending}>
          <FormFields fields={fields} values={values} onChange={setValues} />
        </fieldset>
        {notice?.(values)}
        <ErrorNotice message={mutation.error} />
        <footer>
          <button type="button" className="button" onClick={onClose} disabled={mutation.pending}>
            {text.cancel}
          </button>
          <button className="button primary" disabled={mutation.pending}>
            {mutation.pending ? text.loading : submitLabel}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
