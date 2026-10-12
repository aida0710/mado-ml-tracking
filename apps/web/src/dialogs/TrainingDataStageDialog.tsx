import type { Run, RunCheckpoint, TrainingDataStagePage } from '@mmt/contracts';
import { trainingApi } from '../api/training';
import { FormDialog } from '../components/FormDialog';
import { QueryDialog } from '../components/QueryDialog';
import { useProjectDatasetVersions } from '../hooks/useProjectDatasetVersions';
import { getFieldValue, getSelectedValues } from '../lib/formValues';
import { qualifiedDatasetVersionLabel } from '../lib/datasetVersionLabel';
import { trainingText } from '../i18n/training';

export function TrainingDataStageDialog({
  run,
  history,
  checkpoint,
  onClose,
  onSaved,
}: {
  run: Run;
  history: TrainingDataStagePage;
  checkpoint?: Pick<RunCheckpoint, 'id' | 'step'>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const versions = useProjectDatasetVersions(run.projectId);
  const previous = history.items.at(-1);
  const note = (values: Parameters<typeof getFieldValue>[0]) =>
    getFieldValue(values, 'note').trim();
  return (
    <QueryDialog title={trainingText.recordTrainingData} query={versions} onClose={onClose}>
      {(choices) => (
        <FormDialog
          title={trainingText.recordTrainingData}
          onClose={onClose}
          description={trainingText.trainingDataHint}
          submitLabel={trainingText.recordTrainingData}
          fields={[
            {
              name: 'startStep',
              label: trainingText.trainingDataStartStep,
              type: 'number',
              required: true,
              min: previous ? previous.startStep + 1 : history.initialStep,
              defaultValue: checkpoint ? String(checkpoint.step + 1) : '',
            },
            {
              name: 'inputDatasetVersionIds',
              label: trainingText.trainingDataConfiguration,
              type: 'checkboxes',
              defaultValue: previous?.inputDatasetVersionIds ?? history.initialDatasetVersionIds,
              options: choices.map((version) => ({
                value: version.id,
                label: qualifiedDatasetVersionLabel(version),
              })),
            },
            { name: 'note', label: trainingText.trainingDataNote, type: 'textarea' },
          ]}
          onSubmit={(values) =>
            trainingApi.appendStage(run.projectId, run.id, {
              startStep: Number(getFieldValue(values, 'startStep')),
              inputDatasetVersionIds: getSelectedValues(values, 'inputDatasetVersionIds'),
              checkpointId: checkpoint?.id,
              metadata: note(values) ? { note: note(values) } : {},
            })
          }
          onSaved={onSaved}
        />
      )}
    </QueryDialog>
  );
}
