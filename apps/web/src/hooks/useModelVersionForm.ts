import { useState } from 'react';
import type { Artifact, Model, ModelVersion } from '@mmt/contracts';
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
 * ［バージョンを作成］フォームの状態。下書き、元として指定できる学習のRun、親と既定のコードを取る
 * カタログ、重みのアップロード、保存。
 */
export function useModelVersionForm({ projectId, model }: { projectId: string; model: Model }) {
  const [draft, setDraft] = useState<ModelVersionDraft>(EMPTY_MODEL_VERSION_DRAFT);
  const [isUploadingWeights, setIsUploadingWeights] = useState(false);
  const catalog = useExecutionCatalog(projectId);
  const sourceRuns = useQuery({ key: `${projectId}:source-runs`, load: async (signal) =>
    (
      await trackingApi.searchRuns(
        projectId,
        { kinds: SOURCE_RUN_KINDS, limit: SELECTABLE_RUN_LIMIT },
        signal,
      )
    ).items,
  });
  const mutation = useMutation();
  function change(changes: Partial<ModelVersionDraft>) {
    setDraft((previous) => ({ ...previous, ...changes }));
    mutation.clearError();
  }
  function chooseSourceRun(sourceRunId: string) {
    setDraft((previous) => withSourceRun(previous, sourceRunId));
    mutation.clearError();
  }
  /** アップロードしたファイルを、一覧から選んだのと同じように重みにする。 */
  function selectUploadedWeights(weightsArtifact: Artifact) {
    setDraft((previous) => ({ ...previous, weightsArtifact }));
    setIsUploadingWeights(false);
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
    isUploadingWeights,
    openWeightsUpload: () => setIsUploadingWeights(true),
    closeWeightsUpload: () => setIsUploadingWeights(false),
    selectUploadedWeights,
    save,
    pending: mutation.pending,
    error: mutation.error,
  };
}
