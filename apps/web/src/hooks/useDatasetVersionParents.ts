import {
  datasetVersionParentsApi,
  type DatasetVersionParentLocation,
} from '../api/datasetVersionParents';
import { useQuery } from './useQuery';

export function useDatasetVersionParents(location: DatasetVersionParentLocation) {
  return useQuery({ key: `${location.projectId}:dataset-parents:${location.versionId}`, load: (signal) =>
    datasetVersionParentsApi.get(location, signal),
  });
}
