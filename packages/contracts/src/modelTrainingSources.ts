import type { JsonObject } from './index.js';

/** モデルバージョンの学習のRun。登録時に記録するか、後から足す。 */
export interface ModelVersionTrainingSource {
  projectId: string;
  modelId: string;
  modelVersionId: string;
  runId: string;
  origin: 'registration' | 'association';
  evidence: JsonObject;
  createdBy: string | null;
  createdAt: string;
}

/** POST /projects/:p/models/:id/versions/:v/training-source. */
export interface HistoricalTrainingRunCreate {
  experimentId: string;
  name: string;
  kind: 'training' | 'finetuning';
  modelVersionId?: string | null;
  codeVersionId?: string | null;
  parentRunId?: string | null;
  inputDatasetVersionIds?: string[];
  parameters?: JsonObject;
  tags?: Record<string, string>;
  environment?: JsonObject;
  // 分からない過去の時刻は、登録の時刻で置き換えずnullのままにする。
  startedAt?: string | null;
  endedAt?: string | null;
}

export type ModelVersionTrainingSourceCreate =
  | { runId: string; run?: never; evidence?: JsonObject }
  | { runId?: never; run: HistoricalTrainingRunCreate; evidence?: JsonObject };
