import {
  datasetVersionParentsApi,
  type DatasetVersionParentLocation,
} from '../api/datasetVersionParents';
import { useQuery } from './useQuery';

export function useDatasetVersionParents(location: DatasetVersionParentLocation) {
  return useQuery(`${location.projectId}:dataset-parents:${location.versionId}`, (signal) =>
    datasetVersionParentsApi.get(location, signal),
  );
}
