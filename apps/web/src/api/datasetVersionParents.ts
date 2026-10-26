import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { DatasetVersionParentCreate } from '@mmt/contracts';
import { datasetVersionParentPageSchema } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

export interface DatasetVersionParentLocation {
  projectId: string;
  datasetId: string;
  versionId: string;
}

const parentPath = (location: DatasetVersionParentLocation) =>
  `${projectPath(location.projectId)}/datasets/${encodeId(location.datasetId)}/versions/${encodeId(location.versionId)}/parents`;

export const datasetVersionParentsApi = {
  get: (location: DatasetVersionParentLocation, signal?: AbortSignal) =>
    requestJson(parentPath(location), { schema: datasetVersionParentPageSchema, init: { signal } }),
  append: (location: DatasetVersionParentLocation, input: DatasetVersionParentCreate) =>
    requestJson(parentPath(location), {
      schema: datasetVersionParentPageSchema,
      init: jsonRequestInit('POST', input),
    }),
};
