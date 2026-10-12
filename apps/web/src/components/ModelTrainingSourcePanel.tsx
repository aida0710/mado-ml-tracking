import { useState } from 'react';
import type { ModelVersionDetail, Run } from '@mmt/contracts';
import { trainingApi } from '../api/training';
import { ModelTrainingSourceDialog } from '../dialogs/ModelTrainingSourceDialog';
import { useQuery } from '../hooks/useQuery';
import { Resource } from './Feedback';
import { DatasetVersionNameLinks } from './DatasetVersionNameLinks';
import { JsonDetails } from './JsonDetails';
import { useLocale } from '../i18n/useLocale';
import { trainingText } from '../i18n/training';

export function ModelTrainingSourcePanel({
  projectId,
  detail,
  sourceRun,
  canEdit,
  onSaved,
}: {
  projectId: string;
  detail: ModelVersionDetail;
  sourceRun?: Run;
  canEdit: boolean;
  onSaved: () => void;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const location = { projectId, modelId: detail.model.id, versionId: detail.version.id };
  const source = useQuery(`${projectId}:training-source:${detail.version.id}`, (signal) =>
    trainingApi.source(location, signal),
  );
  return (
    <section className="model-version-section" aria-label={trainingText.trainingSource}>
      <h2>{trainingText.trainingSource}</h2>
      <Resource query={source}>
        {(value) => (
          <>
            {sourceRun && (
              <div>
                <span>{trainingText.trainingSourceDatasets}: </span>
                <DatasetVersionNameLinks
                  projectId={projectId}
                  versionIds={
                    sourceRun.trainingDatasetVersionIds ?? sourceRun.inputDatasetVersionIds
                  }
                />
              </div>
            )}
            {sourceRun?.trainingDatasetVersionIds && (
              <p className="muted">{trainingText.trainingSourceDatasetsHint}</p>
            )}
            {value && Object.keys(value.evidence ?? {}).length > 0 && (
              <JsonDetails value={value.evidence} />
            )}
            {!value && <p className="muted">{trainingText.trainingSourceHint}</p>}
            {!value && canEdit && (
              <button className="button" onClick={() => setOpen(true)}>
                {trainingText.associateTrainingSource}
              </button>
            )}
          </>
        )}
      </Resource>
      {open && (
        <ModelTrainingSourceDialog
          projectId={projectId}
          detail={detail}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            source.reload();
            onSaved();
          }}
        />
      )}
    </section>
  );
}
