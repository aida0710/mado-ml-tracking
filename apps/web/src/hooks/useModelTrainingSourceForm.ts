import { useState } from 'react';
import type { ModelVersionDetail, Run } from '@mmt/contracts';
import type { FormValues } from '../types/form';
import { trainingApi } from '../api/training';
import {
  buildModelTrainingSourceInput,
  isTrainingSourceCandidate,
} from '../lib/modelTrainingSource';
import { useMutation } from './useMutation';

export function useModelTrainingSourceForm({
  projectId,
  detail,
  runs,
}: {
  projectId: string;
  detail: ModelVersionDetail;
  runs: Run[];
}) {
  const candidates = runs.filter((run) => isTrainingSourceCandidate(run, detail.version.id));
  const mutation = useMutation();
  const [values, setValues] = useState<FormValues>({
    mode: candidates.length ? 'existing' : 'historical',
    runId: '',
    name: `${detail.model.name} / ${detail.version.version}`,
    experimentId: '',
    kind: 'training',
    modelVersionId: '',
    codeVersionId: '',
    inputDatasetVersionIds: [],
    parameters: '{}',
    tags: '{}',
    startedAt: '',
    endedAt: '',
    note: '',
  });
  return {
    values,
    candidates,
    pending: mutation.pending,
    error: mutation.error,
    changeValues: (next: FormValues) => {
      setValues(next);
      mutation.clearError();
    },
    selectExperiment: (id: string) => {
      setValues((previous) => ({ ...previous, experimentId: id }));
      mutation.clearError();
    },
    associate: () =>
      mutation.run(() =>
        trainingApi.associateSource(
          { projectId, modelId: detail.model.id, versionId: detail.version.id },
          buildModelTrainingSourceInput(values),
        ),
      ),
  };
}
