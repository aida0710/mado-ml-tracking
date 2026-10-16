import type { JsonObject } from './index.js';

export interface LineageRelationAddition {
  id: string;
  projectId: string;
  sourceId: string;
  sourceKind: 'run' | 'modelVersion' | 'datasetVersion';
  targetId: string;
  targetKind: 'run' | 'modelVersion' | 'datasetVersion';
  relation: 'input' | 'output' | 'model' | 'parentRun' | 'reference';
  reason: string;
  evidence: JsonObject;
  createdBy: string;
  createdAt: string;
}
