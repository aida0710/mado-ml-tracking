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

/** 完全な構成をstepの順に比べ、引き継いだデータセットを「追加」と表示しないようにする。 */
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
