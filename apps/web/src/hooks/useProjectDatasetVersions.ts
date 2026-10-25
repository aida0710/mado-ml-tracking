import { registryApi } from '../api/registry';
import { useQuery } from './useQuery';

export function useProjectDatasetVersions(projectId: string, enabled = true) {
  return useQuery({ key: enabled ? `${projectId}:dataset-version-choices` : null, load: async (signal) => {
    const datasets = await registryApi.datasets(projectId, signal);
    const versions = await Promise.all(
      datasets.map((dataset) => registryApi.datasetVersions(projectId, dataset.id, signal)),
    );
    return versions.flat();
  } });
}
