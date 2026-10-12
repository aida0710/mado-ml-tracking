import { useState } from 'react';
import type { Run } from '@mmt/contracts';
import { useTrainingDataStages } from '../hooks/useTrainingDataStages';
import { TrainingDataStageDialog } from '../dialogs/TrainingDataStageDialog';
import { trainingDataTimeline } from '../lib/trainingDataTimeline';
import { DataTable } from './DataTable';
import { DatasetVersionNameLinks } from './DatasetVersionNameLinks';
import { Resource } from './Feedback';
import { trainingText, trainingTextTemplates } from '../i18n/training';
import { useLocale } from '../i18n/useLocale';

export function TrainingDataStagesPanel({
  run,
  canRecord,
  onSaved,
}: {
  run: Run;
  canRecord: boolean;
  onSaved: () => void;
}) {
  useLocale();
  const history = useTrainingDataStages(run);
  const [open, setOpen] = useState(false);
  return (
    <section aria-label={trainingText.trainingData}>
      <p className="muted">{trainingText.trainingDataHint}</p>
      {canRecord && (
        <div className="section-actions">
          <button className="button" onClick={() => setOpen(true)}>
            {trainingText.recordTrainingData}
          </button>
        </div>
      )}
      <Resource query={history}>
        {(page) => (
          <>
            {!page.items.length && <p className="muted">{trainingText.trainingDataEmpty}</p>}
            <DataTable
              items={trainingDataTimeline(page)}
              rowKey={(entry) => entry.id}
              columns={[
                {
                  key: 'step',
                  label: trainingText.trainingDataStartStep,
                  render: (entry) => (
                    <>
                      <span className="mono">
                        {trainingTextTemplates.trainingDataFromStep(entry.startStep)}
                      </span>
                      {entry.initial && <p className="muted">{trainingText.trainingDataInitial}</p>}
                    </>
                  ),
                },
                {
                  key: 'datasets',
                  label: trainingText.trainingDataConfiguration,
                  render: (entry) => (
                    <DatasetVersionNameLinks
                      projectId={run.projectId}
                      versionIds={entry.inputDatasetVersionIds}
                    />
                  ),
                },
                {
                  key: 'added',
                  label: trainingText.trainingDataAdded,
                  render: (entry) => (
                    <DatasetVersionNameLinks
                      projectId={run.projectId}
                      versionIds={entry.addedDatasetVersionIds}
                    />
                  ),
                },
                {
                  key: 'removed',
                  label: trainingText.trainingDataRemoved,
                  render: (entry) => (
                    <DatasetVersionNameLinks
                      projectId={run.projectId}
                      versionIds={entry.removedDatasetVersionIds}
                    />
                  ),
                },
                {
                  key: 'note',
                  label: trainingText.trainingDataNote,
                  render: (entry) => entry.note ?? '—',
                },
              ]}
            />
          </>
        )}
      </Resource>
      {open && history.value && (
        <TrainingDataStageDialog
          run={run}
          history={history.value}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            history.reload();
            onSaved();
          }}
        />
      )}
    </section>
  );
}
