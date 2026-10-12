import type { RunDatasetUsage } from '@mmt/contracts';
import { encodeId, projectPath, request } from './http';

/** How a Run used its input dataset versions: role, mixing weight and selection conditions. */
export const datasetUsageApi = {
  forRun: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (
      await request<RunDatasetUsage>(
        `${projectPath(projectId)}/runs/${encodeId(runId)}/dataset-usage`,
        { signal },
      )
    ).items,
};
