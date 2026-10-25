import { isTrainingRunKind, type Run, type TrainingDataStagePage } from '@mmt/contracts';
import type { TrainingContinuation } from '../types/trainingContinuation';
import type { FormValues } from '../types/form';
import type { CreateRun } from '../api/inputs';
import { initialLaunchValues } from './launchFormValues';
import { trainingTextTemplates } from '../i18n/training';

// これらのタグはサーバーが管理する自動実行を表す。独立した新しいRunに引き継いではいけない。
const SERVER_RUN_TAG_PREFIXES = ['automation.', 'mmt.'];

export function canContinueTraining(run: Pick<Run, 'kind' | 'codeVersionId'>): boolean {
  return isTrainingRunKind(run.kind) && Boolean(run.codeVersionId);
}

export function datasetVersionIdsAtStep(history: TrainingDataStagePage, step: number): string[] {
  return (
    history.items.findLast((stage) => stage.startStep <= step)?.inputDatasetVersionIds ??
    history.initialDatasetVersionIds
  );
}

export function checkpointTrainingValues(continuation: TrainingContinuation): FormValues {
  const environment = { ...continuation.run.environment };
  delete environment.resume;
  delete environment.runtime;
  const tags = Object.fromEntries(
    Object.entries(continuation.run.tags).filter(
      ([key]) => !SERVER_RUN_TAG_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  );
  return {
    ...initialLaunchValues(continuation.run),
    name: trainingTextTemplates.continueTrainingName(
      continuation.run.name,
      continuation.checkpoint.step,
    ),
    inputDatasetVersionIds: continuation.inputDatasetVersionIds,
    environment: JSON.stringify(environment, null, 2),
    tags: JSON.stringify(tags, null, 2),
  };
}

export function pinCheckpointTrainingInput(
  input: CreateRun,
  continuation?: TrainingContinuation,
): CreateRun {
  if (!continuation) return input;
  return {
    ...input,
    kind: continuation.run.kind,
    modelVersionId: continuation.run.modelVersionId ?? undefined,
    resumeCheckpointId: continuation.checkpoint.id,
    parentRunId: continuation.run.id,
  };
}
