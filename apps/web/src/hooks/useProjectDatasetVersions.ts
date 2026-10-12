import { registryApi } from '../api/registry';
import { useQuery } from './useQuery';

export function useProjectDatasetVersions(projectId: string, enabled = true) {
  return useQuery(enabled ? `${projectId}:dataset-version-choices` : null, async (signal) => {
    const datasets = await registryApi.datasets(projectId, signal);
    const versions = await Promise.all(
      datasets.map((dataset) => registryApi.datasetVersions(projectId, dataset.id, signal)),
    );
    return versions.flat();
  });
}
