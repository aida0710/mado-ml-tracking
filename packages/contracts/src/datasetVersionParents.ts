import type { JsonObject } from './index.js';

/** 既存のバージョンに後から足した過去の由来。学習データの変更とは別に扱う。 */
export interface DatasetVersionParentAddition {
  id: string;
  projectId: string;
  datasetVersionId: string;
  parentDatasetVersionId: string;
  reason: string;
  evidence: JsonObject;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface DatasetVersionParentPage {
  registeredParentDatasetVersionIds: string[];
  parentDatasetVersionIds: string[];
  items: DatasetVersionParentAddition[];
}

export interface DatasetVersionParentCreate {
  parentDatasetVersionIds: string[];
  reason: string;
  evidence: JsonObject;
}
