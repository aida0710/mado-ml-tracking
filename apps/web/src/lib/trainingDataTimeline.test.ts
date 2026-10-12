import type { TrainingDataStagePage } from '@mmt/contracts';
import { describe, expect, it } from 'vitest';
import { trainingDataTimeline } from './trainingDataTimeline';

describe('学習データの構成をstepごとに比較する', () => {
  it('残したデータと追加したデータ、途中で外したデータを区別する', () => {
    const page = {
      initialStep: 0,
      initialDatasetVersionIds: ['original'],
      items: [
        {
          id: 'first',
          startStep: 1001,
          inputDatasetVersionIds: ['original', 'synthetic'],
          checkpointId: 'checkpoint',
          metadata: { note: 'Synthetic data added' },
        },
        {
          id: 'second',
          startStep: 2001,
          inputDatasetVersionIds: ['synthetic'],
          checkpointId: null,
          metadata: {},
        },
      ],
    } as TrainingDataStagePage;
    const timeline = trainingDataTimeline(page);
    expect(timeline[0]).toMatchObject({
      initial: true,
      startStep: 0,
      inputDatasetVersionIds: ['original'],
      addedDatasetVersionIds: [],
    });
    expect(timeline[1]).toMatchObject({
      startStep: 1001,
      addedDatasetVersionIds: ['synthetic'],
      removedDatasetVersionIds: [],
      checkpointId: 'checkpoint',
    });
    expect(timeline[2]).toMatchObject({
      startStep: 2001,
      addedDatasetVersionIds: [],
      removedDatasetVersionIds: ['original'],
    });
    expect(page.initialDatasetVersionIds).toEqual(['original']);
  });
});
