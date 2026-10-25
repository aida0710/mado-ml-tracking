import type { ExecutionCatalog } from '../types/executionCatalog';
import { registryApi } from '../api/registry';
import { trackingApi } from '../api/tracking';
import { useQuery } from './useQuery';

// Selectors offer the newest Runs, one search page at the API maximum; older Runs are reached
// through the Run search on the Experiments page.
export const SELECTABLE_RUN_LIMIT = 500;
export function useExecutionCatalog(projectId: string) {
  return useQuery<ExecutionCatalog>({ key: `${projectId}:execution-catalog`, load: async (signal) => {
    const [experiments, models, { codes, codeVersions }, datasets, runs] = await Promise.all([
      trackingApi.experiments(projectId, signal),
      registryApi.models(projectId, signal),
      registryApi.codesWithVersions(projectId, signal),
      registryApi.datasets(projectId, signal),
      trackingApi
        .searchRuns(projectId, { limit: SELECTABLE_RUN_LIMIT }, signal)
        .then((page) => page.items),
    ]);
    const [modelVersions, datasetVersions] = await Promise.all([
      Promise.all(models.map((model) => registryApi.modelVersions(projectId, model.id, signal))),
      Promise.all(
        datasets.map((dataset) => registryApi.datasetVersions(projectId, dataset.id, signal)),
      ),
    ]);
    return {
      experiments,
      models,
      codes,
      datasets,
      runs,
      modelVersions: modelVersions.flat(),
      codeVersions,
      datasetVersions: datasetVersions.flat(),
    };
  } });
}
