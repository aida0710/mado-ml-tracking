import type { JsonObject } from './index.js';

/** Historical provenance added to an existing version, separate from training data changes. */
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
