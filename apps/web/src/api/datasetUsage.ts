import type { RunDatasetUsage } from '@mmt/contracts';
import { encodeId, projectPath, request } from './http';

/** Runが入力のデータセットのバージョンをどう使ったか（役割、混合の重み、選択の条件）。 */
export const datasetUsageApi = {
  forRun: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (
      await request<RunDatasetUsage>(
        `${projectPath(projectId)}/runs/${encodeId(runId)}/dataset-usage`,
        { signal },
      )
    ).items,
};
