import type { Run, RunCheckpoint } from '@mmt/contracts';

export interface TrainingContinuation {
  run: Run;
  checkpoint: Pick<RunCheckpoint, 'id' | 'step'>;
  inputDatasetVersionIds: string[];
}
