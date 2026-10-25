import type { JsonObject } from './index.js';

export const DATASET_USAGE_ROLES = ['input', 'training', 'validation', 'test'] as const;
export type DatasetUsageRole = (typeof DATASET_USAGE_ROLES)[number];

/** selectionは、固定したDatasetVersionとともに、実行するコードが読む宣言。 */
export interface DatasetUsage {
  datasetVersionId: string;
  role: DatasetUsageRole;
  weight: number;
  selection: JsonObject;
}

export interface RunDatasetUsage {
  items: DatasetUsage[];
}
