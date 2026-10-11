import { useState } from 'react';
import type { Model, ModelVersion } from '@mmt/contracts';
import { registryApi } from '../api/registry';
import { trackingApi } from '../api/tracking';
import {
  buildModelVersionInput,
  EMPTY_MODEL_VERSION_DRAFT,
  SOURCE_RUN_KINDS,
  withSourceRun,
  type ModelVersionDraft,
} from '../lib/modelVersionInput';
import { SELECTABLE_RUN_LIMIT, useExecutionCatalog } from './useExecutionCatalog';
import { useMutation } from './useMutation';
import { useQuery } from './useQuery';

/**
 * State of the［バージョンを作成］form: the draft, the training Runs it may name as the source, the
 * catalog its parents and default code come from, and saving.
 */
export function useModelVersionForm({ projectId, model }: { projectId: string; model: Model }) {
  const [draft, setDraft] = useState<ModelVersionDraft>(EMPTY_MODEL_VERSION_DRAFT);
  const catalog = useExecutionCatalog(projectId);
  const sourceRuns = useQuery(`${projectId}:source-runs`, async (signal) =>
    (
      await trackingApi.searchRuns(
        projectId,
        { kinds: SOURCE_RUN_KINDS, limit: SELECTABLE_RUN_LIMIT },
        signal,
      )
    ).items,
  );
  const mutation = useMutation();
  function change(changes: Partial<ModelVersionDraft>) {
    setDraft((previous) => ({ ...previous, ...changes }));
    mutation.clearError();
  }
  function chooseSourceRun(sourceRunId: string) {
    setDraft((previous) => withSourceRun(previous, sourceRunId));
    mutation.clearError();
  }
  function save(): Promise<ModelVersion | undefined> {
    return mutation.run(() =>
      registryApi.createModelVersion(projectId, model.id, buildModelVersionInput(draft)),
    );
  }
  return {
    draft,
    change,
    chooseSourceRun,
    catalog,
    sourceRuns,
    save,
    pending: mutation.pending,
    error: mutation.error,
  };
}
