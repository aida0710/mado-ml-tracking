import type { TrainingDataStagePage } from '@mmt/contracts';

export interface TrainingDataTimelineEntry {
  id: string;
  startStep: number;
  inputDatasetVersionIds: string[];
  addedDatasetVersionIds: string[];
  removedDatasetVersionIds: string[];
  checkpointId: string | null;
  note: string | null;
  initial: boolean;
}

/** Compares full configurations in step order so an inherited dataset is never labelled added. */
export function trainingDataTimeline(page: TrainingDataStagePage): TrainingDataTimelineEntry[] {
  const entries: TrainingDataTimelineEntry[] = [
    {
      id: 'initial',
      startStep: page.initialStep,
      inputDatasetVersionIds: page.initialDatasetVersionIds,
      addedDatasetVersionIds: [],
      removedDatasetVersionIds: [],
      checkpointId: null,
      note: null,
      initial: true,
    },
  ];
  let previous = page.initialDatasetVersionIds;
  for (const stage of page.items) {
    entries.push({
      id: stage.id,
      startStep: stage.startStep,
      inputDatasetVersionIds: stage.inputDatasetVersionIds,
      addedDatasetVersionIds: stage.inputDatasetVersionIds.filter((id) => !previous.includes(id)),
      removedDatasetVersionIds: previous.filter((id) => !stage.inputDatasetVersionIds.includes(id)),
      checkpointId: stage.checkpointId,
      note: typeof stage.metadata.note === 'string' ? stage.metadata.note : null,
      initial: false,
    });
    previous = stage.inputDatasetVersionIds;
  }
  return entries;
}
