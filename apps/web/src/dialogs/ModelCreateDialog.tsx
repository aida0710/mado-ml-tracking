import type { Model } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import { FormDialog } from '../components/FormDialog';
import { useModelFamilies } from '../hooks/useModelFamilies';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/** モデルを登録する。モデル系列は、Projectが使っている系列から選ぶか、新しく入力する。 */
export function ModelCreateDialog({
  projectId,
  onClose,
  onSaved,
}: {
  projectId: string;
  onClose: () => void;
  onSaved: (model: Model) => void;
}) {
  useLocale();
  const families = useModelFamilies(projectId);
  return (
    <FormDialog
      title={text.newModel}
      onClose={onClose}
      fields={[
        { name: 'name', label: text.name, required: true },
        {
          name: 'family',
          label: text.family,
          required: true,
          suggest: families.suggest,
          offerSuggestionsWhenEmpty: true,
          suggestionsRefreshKey: families.refreshKey,
          hint: text.familyHint,
        },
        { name: 'description', label: text.description, type: 'textarea' },
      ]}
      notice={() =>
        families.error ? (
          <p className="notice" role="status">
            {text.familiesLoadFailed}
          </p>
        ) : null
      }
      onSubmit={(values) =>
        registryApi.createModel(projectId, {
          name: getFieldValue(values, 'name'),
          family: getFieldValue(values, 'family').trim(),
          description: getFieldValue(values, 'description'),
        })
      }
      onSaved={onSaved}
    />
  );
}
