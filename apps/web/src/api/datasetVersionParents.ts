import type { DatasetVersionParentCreate, DatasetVersionParentPage } from '@mmt/contracts';
import { encodeId, jsonRequest, projectPath, request } from './http';

export interface DatasetVersionParentLocation {
  projectId: string;
  datasetId: string;
  versionId: string;
}

const parentPath = (location: DatasetVersionParentLocation) =>
  `${projectPath(location.projectId)}/datasets/${encodeId(location.datasetId)}/versions/${encodeId(location.versionId)}/parents`;

export const datasetVersionParentsApi = {
  get: (location: DatasetVersionParentLocation, signal?: AbortSignal) =>
    request<DatasetVersionParentPage>(parentPath(location), { signal }),
  append: (location: DatasetVersionParentLocation, input: DatasetVersionParentCreate) =>
    request<DatasetVersionParentPage>(parentPath(location), jsonRequest('POST', input)),
};
