import type {
  ModelVersionTrainingSource,
  ModelVersionTrainingSourceCreate,
  TrainingDataStage,
  TrainingDataStageCreate,
  TrainingDataStagePage,
} from '@mmt/contracts';
import { encodeId, jsonRequest, projectPath, request } from './http';

export interface ModelTrainingSourceLocation {
  projectId: string;
  modelId: string;
  versionId: string;
}

const sourcePath = (location: ModelTrainingSourceLocation) =>
  `${projectPath(location.projectId)}/models/${encodeId(location.modelId)}/versions/${encodeId(location.versionId)}/training-source`;
const stagesPath = (projectId: string, runId: string) =>
  `${projectPath(projectId)}/runs/${encodeId(runId)}/training-data-stages`;

export const trainingApi = {
  source: async (location: ModelTrainingSourceLocation, signal?: AbortSignal) =>
    (await request<{ source: ModelVersionTrainingSource | null }>(sourcePath(location), { signal }))
      .source,
  associateSource: (
    location: ModelTrainingSourceLocation,
    input: ModelVersionTrainingSourceCreate,
  ) => request<ModelVersionTrainingSource>(sourcePath(location), jsonRequest('POST', input)),
  stages: (projectId: string, runId: string, signal?: AbortSignal) =>
    request<TrainingDataStagePage>(stagesPath(projectId, runId), { signal }),
  appendStage: (projectId: string, runId: string, input: TrainingDataStageCreate) =>
    request<TrainingDataStage>(stagesPath(projectId, runId), jsonRequest('POST', input)),
};
