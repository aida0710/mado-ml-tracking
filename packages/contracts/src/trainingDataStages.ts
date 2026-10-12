import type { JsonObject } from './index.js';

/** The full dataset configuration used from a training step, rather than just the added IDs. */
export interface TrainingDataStage {
  id: string;
  projectId: string;
  runId: string;
  startStep: number;
  inputDatasetVersionIds: string[];
  checkpointId: string | null;
  metadata: JsonObject;
  createdBy: string;
  createdAt: string;
}

export interface TrainingDataStageCreate {
  startStep: number;
  inputDatasetVersionIds: string[];
  checkpointId?: string | null;
  metadata?: JsonObject;
}

export interface TrainingDataStagePage {
  initialStep: number;
  initialDatasetVersionIds: string[];
  items: TrainingDataStage[];
}
