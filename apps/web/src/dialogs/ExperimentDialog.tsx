import type { Experiment } from '@mmt/contracts';
import { trackingApi } from '../api/tracking';
import { FormDialog } from '../components/FormDialog';
import { getFieldValue } from '../lib/formValues';
import { findExperimentNamed } from '../lib/experimentList';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';

/**
 * Experimentを作る。入力中の名前がProjectに既にあるうちはそう伝え、代わりにそのExperimentを
 * 開くよう勧める（APIがその名前を拒むため）。
 */
export function ExperimentDialog({
  projectId,
  experiments,
  onClose,
  onCreated,
  onOpenExisting,
}: {
  projectId: string;
  /** 一覧に出ているProjectのExperiment。読み込み中はundefined。 */
  experiments: readonly Experiment[] | undefined;
  onClose: () => void;
  onCreated: (experiment: Experiment) => void;
  onOpenExisting: (experiment: Experiment) => void;
}) {
  useLocale();
  return (
    <FormDialog
      title={text.newExperiment}
      fields={[
        { name: 'name', label: text.name, required: true, hint: text.experimentNameHint },
        { name: 'description', label: text.description, type: 'textarea' },
      ]}
      onClose={onClose}
      onSubmit={(values) =>
        trackingApi.createExperiment(projectId, {
          name: getFieldValue(values, 'name'),
          description: getFieldValue(values, 'description'),
        })
      }
      onSaved={onCreated}
      notice={(values) => {
        const existing = findExperimentNamed(experiments ?? [], getFieldValue(values, 'name'));
        if (!existing) return null;
        return (
          <p className="notice warning" role="status">
            {text.experimentNameTaken}{' '}
            <button type="button" className="button small" onClick={() => onOpenExisting(existing)}>
              {text.openExistingExperiment}
            </button>
          </p>
        );
      }}
    />
  );
}
