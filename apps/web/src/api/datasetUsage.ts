import { requestJson } from '@mado/design-system/http';
import { runDatasetUsageSchema } from '@mmt/contracts/schemas';
import { encodeId, projectPath } from './http';

/** Runが入力のデータセットのバージョンをどう使ったか（役割、混合の重み、選択の条件）。 */
export const datasetUsageApi = {
  forRun: async (projectId: string, runId: string, signal?: AbortSignal) =>
    (
      await requestJson(`${projectPath(projectId)}/runs/${encodeId(runId)}/dataset-usage`, {
        schema: runDatasetUsageSchema,
        init: { signal },
      })
    ).items,
};
