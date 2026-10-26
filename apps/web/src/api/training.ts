import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { ModelVersionTrainingSourceCreate, TrainingDataStageCreate } from '@mmt/contracts';
import {
  modelVersionTrainingSourceResponseSchema,
  modelVersionTrainingSourceSchema,
  trainingDataStagePageSchema,
  trainingDataStageSchema,
} from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

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
    (await requestJson(sourcePath(location), { schema: modelVersionTrainingSourceResponseSchema, init: { signal } }))
      .source,
  associateSource: (location: ModelTrainingSourceLocation, input: ModelVersionTrainingSourceCreate) =>
    requestJson(sourcePath(location), {
      schema: modelVersionTrainingSourceSchema,
      init: jsonRequestInit('POST', input),
    }),
  stages: (projectId: string, runId: string, signal?: AbortSignal) =>
    requestJson(stagesPath(projectId, runId), { schema: trainingDataStagePageSchema, init: { signal } }),
  appendStage: (projectId: string, runId: string, input: TrainingDataStageCreate) =>
    requestJson(stagesPath(projectId, runId), { schema: trainingDataStageSchema, init: jsonRequestInit('POST', input) }),
};
