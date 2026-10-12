import { useState } from 'react';
import { ExperimentDialog } from './ExperimentDialog';
import { TRAINING_RUN_KINDS, type ModelVersionDetail } from '@mmt/contracts';
import type { ExecutionCatalog } from '../types/executionCatalog';
import type { FormField } from '../types/form';
import { Dialog } from '../components/Dialog';
import { QueryDialog } from '../components/QueryDialog';
import { ChoiceField } from '../components/ChoiceField';
import { FormFields } from '../components/FormFields';
import { DatasetVersionNameLinks } from '../components/DatasetVersionNameLinks';
import { ErrorNotice } from '../components/Feedback';
import { useExecutionCatalog } from '../hooks/useExecutionCatalog';
import { useModelTrainingSourceForm } from '../hooks/useModelTrainingSourceForm';
import { buildCatalogOptions, withEmptyOption } from '../lib/catalogOptions';
import { getFieldValue } from '../lib/formValues';
import { useLocale } from '../i18n/useLocale';
import { text } from '../i18n/catalog';
import { trainingText } from '../i18n/training';

export function ModelTrainingSourceDialog({
  projectId,
  detail,
  onClose,
  onSaved,
}: {
  projectId: string;
  detail: ModelVersionDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const catalog = useExecutionCatalog(projectId);
  return (
    <QueryDialog title={trainingText.associateTrainingSource} onClose={onClose} query={catalog}>
      {(choices) => (
        <TrainingSourceForm
          projectId={projectId}
          detail={detail}
          catalog={choices}
          onCatalogChanged={catalog.reload}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </QueryDialog>
  );
}

function TrainingSourceForm({
  projectId,
  detail,
  catalog,
  onCatalogChanged,
  onClose,
  onSaved,
}: {
  projectId: string;
  detail: ModelVersionDetail;
  catalog: ExecutionCatalog;
  onCatalogChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLocale();
  const form = useModelTrainingSourceForm({ projectId, detail, runs: catalog.runs });
  const { candidates, values } = form;
  const [experimentOpen, setExperimentOpen] = useState(false);
  const options = buildCatalogOptions(catalog);
  const historical = getFieldValue(values, 'mode') === 'historical';
  const selectedRun = candidates.find((run) => run.id === getFieldValue(values, 'runId'));
  const fields: FormField[] = historical
    ? [
        { name: 'name', label: text.runName, required: true },
        {
          name: 'experimentId',
          label: text.experiments,
          type: 'select',
          required: true,
          options: withEmptyOption(options.experiments),
        },
        {
          name: 'kind',
          label: text.kind,
          type: 'select',
          options: TRAINING_RUN_KINDS.map((kind) => ({
            value: kind,
            label: text[kind as 'training' | 'finetuning'],
          })),
        },
        {
          name: 'inputDatasetVersionIds',
          label: text.inputDatasets,
          type: 'checkboxes',
          options: options.datasets,
        },
        {
          name: 'modelVersionId',
          label: text.modelVersion,
          type: 'select',
          options: withEmptyOption(
            options.models.filter((option) => option.value !== detail.version.id),
          ),
        },
        {
          name: 'codeVersionId',
          label: text.codeVersion,
          type: 'select',
          options: withEmptyOption(options.codes),
        },
        { name: 'parameters', label: `${text.parameters} (JSON)`, type: 'textarea' },
        { name: 'tags', label: `${text.tags} (JSON)`, type: 'textarea' },
        { name: 'startedAt', label: trainingText.trainingStartedAt, type: 'datetime-local' },
        { name: 'endedAt', label: trainingText.trainingEndedAt, type: 'datetime-local' },
      ]
    : [
        {
          name: 'runId',
          label: trainingText.trainingSourceRun,
          type: 'select',
          required: true,
          options: withEmptyOption(candidates.map((run) => ({ value: run.id, label: run.name }))),
        },
      ];
  fields.push({ name: 'note', label: trainingText.trainingSourceEvidence, type: 'textarea' });
  return (
    <>
      <Dialog
        title={trainingText.associateTrainingSource}
        onClose={onClose}
        busy={form.pending}
        wide
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.associate().then((source) => {
              if (source) onSaved();
            });
          }}
        >
          <p>{trainingText.trainingSourceAppendOnly}</p>
          <fieldset disabled={form.pending}>
            <ChoiceField
              label={trainingText.trainingSourceMode}
              value={getFieldValue(values, 'mode')}
              placeholder={trainingText.trainingSourceMode}
              options={[
                { value: 'existing', label: trainingText.trainingSourceExisting },
                { value: 'historical', label: trainingText.trainingSourceHistorical },
              ]}
              onChange={(mode) => form.changeValues({ ...values, mode })}
            />
            {historical ? (
              <p className="muted">{trainingText.trainingSourceHistoricalHint}</p>
            ) : (
              !candidates.length && <p className="notice">{trainingText.trainingSourceNoRuns}</p>
            )}
            {historical && !catalog.experiments.length && (
              <button type="button" className="button" onClick={() => setExperimentOpen(true)}>
                {text.newExperiment}
              </button>
            )}
            <FormFields fields={fields} values={values} onChange={form.changeValues} />
            {selectedRun && !historical && (
              <div className="field-hint">
                <span>{text.inputDatasets}: </span>
                <DatasetVersionNameLinks
                  projectId={projectId}
                  versionIds={
                    selectedRun.trainingDatasetVersionIds ?? selectedRun.inputDatasetVersionIds
                  }
                />
              </div>
            )}
          </fieldset>
          <ErrorNotice message={form.error} />
          <footer>
            <button type="button" className="button" disabled={form.pending} onClick={onClose}>
              {text.cancel}
            </button>
            <button
              className="button primary"
              disabled={form.pending || (!historical && !selectedRun)}
            >
              {trainingText.associateTrainingSource}
            </button>
          </footer>
        </form>
      </Dialog>
      {experimentOpen && (
        <ExperimentDialog
          projectId={projectId}
          experiments={catalog.experiments}
          onClose={() => setExperimentOpen(false)}
          onCreated={(experiment) => {
            form.selectExperiment(experiment.id);
            setExperimentOpen(false);
            onCatalogChanged();
          }}
          onOpenExisting={(experiment) => {
            form.selectExperiment(experiment.id);
            setExperimentOpen(false);
          }}
        />
      )}
    </>
  );
}
