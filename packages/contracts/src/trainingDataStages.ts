import type { JsonObject } from './index.js';

/** 学習のあるstepから使ったデータセットの設定の全体。追加したIDだけではない。 */
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
