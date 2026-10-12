import type { JsonObject } from './index.js';

/** A model version's training Run, recorded at registration or appended later. */
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
  // Unknown historical times stay null rather than being replaced with registration time.
  startedAt?: string | null;
  endedAt?: string | null;
}

export type ModelVersionTrainingSourceCreate =
  | { runId: string; run?: never; evidence?: JsonObject }
  | { runId?: never; run: HistoricalTrainingRunCreate; evidence?: JsonObject };
