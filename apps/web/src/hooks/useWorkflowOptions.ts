import { tasksApi } from '../api/tasks';
import { registryApi } from '../api/registry';
import { useQuery } from './useQuery';

export function useWorkflowOptions(projectId: string) {
  return useQuery(`workflow-options:${projectId}`, async (signal) => {
    const [tasks, datasets] = await Promise.all([
      tasksApi.list(projectId, undefined, signal),
      registryApi.datasets(projectId, signal),
    ]);
    const datasetVersions = (
      await Promise.all(
        datasets.map(async (dataset) =>
          (await registryApi.datasetVersions(projectId, dataset.id, signal)).map((version) => ({
            value: version.id,
            label: `${dataset.name} · ${version.version}`,
          })),
        ),
      )
    ).flat();
    return { tasks: tasks.filter((task) => task.targetId !== null), datasetVersions };
  });
}
