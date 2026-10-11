import type { DatasetUsage, DatasetUsageRole } from './datasetUsage.js';
import type { ExperimentTask, JsonObject } from './index.js';
import type { PreprocessingReport } from './preprocessingReports.js';

// Match the existing maximum Job chain depth so a workflow stays a small, inspectable sequence.
export const WORKFLOW_MAX_STEPS = 10;
export const WORKFLOW_MAX_INPUTS = 100;
// The history page and scheduler batch use the same bounded number of executions.
export const WORKFLOW_PAGE_SIZE = 50;
export const WORKFLOW_MAX_QUALITY_GATES = 20;
// Match PostgreSQL revision storage and existing registry field limits.
export const WORKFLOW_MAX_REVISION = 2_147_483_647;
export const WORKFLOW_MAX_NAME_LENGTH = 200;
export const WORKFLOW_MAX_STEP_KEY_LENGTH = 100;
export const WORKFLOW_MAX_DESCRIPTION_LENGTH = 20_000;
export const WORKFLOW_MAX_IDEMPOTENCY_KEY_LENGTH = 200;
export const WORKFLOW_MAX_METRIC_NAME_LENGTH = 250;

export type WorkflowDatasetSource =
  | { kind: 'dataset'; datasetVersionId: string }
  | { kind: 'step'; stepKey: string; datasetName: string | null };

export interface WorkflowDatasetBinding {
  source: WorkflowDatasetSource;
  role: DatasetUsageRole;
  weight: number;
  selection: JsonObject;
}

export interface WorkflowQualityGate {
  metric: string;
  operator: 'gte' | 'lte' | 'eq';
  threshold: number;
}

export interface WorkflowStepInput {
  key: string;
  name: string;
  taskId: string;
  expectedTaskRevision: number;
  inputs: WorkflowDatasetBinding[];
  modelFromStepKey: string | null;
  qualityGates: WorkflowQualityGate[];
}

export interface WorkflowStep {
  key: string;
  name: string;
  task: ExperimentTask;
  inputs: WorkflowDatasetBinding[];
  modelFromStepKey: string | null;
  qualityGates: WorkflowQualityGate[];
}

export interface Workflow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  latestRevision: number;
  createdBy: string;
  createdAt: string;
}

export interface WorkflowVersion {
  id: string;
  projectId: string;
  workflowId: string;
  revision: number;
  steps: WorkflowStep[];
  createdBy: string;
  createdAt: string;
}

export interface WorkflowDetail {
  workflow: Workflow;
  versions: WorkflowVersion[];
}

export interface WorkflowCreate {
  name: string;
  description?: string;
  steps: WorkflowStepInput[];
}

export interface WorkflowVersionCreate {
  expectedRevision: number;
  steps: WorkflowStepInput[];
}

export interface WorkflowLaunch {
  revision: number;
  idempotencyKey: string;
  /** A failed/canceled execution of this version; completed steps keep their exact Run outputs. */
  resumeFromExecutionId?: string;
}

export type WorkflowExecutionStatus = 'running' | 'canceling' | 'finished' | 'failed' | 'canceled';
export type WorkflowStepStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'finished'
  | 'failed'
  | 'canceled';

export interface WorkflowStepExecution {
  id: string;
  stepIndex: number;
  stepKey: string;
  name: string;
  status: WorkflowStepStatus;
  runId: string | null;
  jobId: string | null;
  reused: boolean;
  datasetUsage: DatasetUsage[];
  outputDatasetVersionIds: string[];
  outputModelVersionIds: string[];
  metrics: Record<string, number>;
  error: string | null;
  endedAt: string | null;
  preprocessingReport: PreprocessingReport | null;
}

export interface WorkflowExecution {
  id: string;
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  revision: number;
  status: WorkflowExecutionStatus;
  createdBy: string;
  createdAt: string;
  endedAt: string | null;
  error: string | null;
  resumeFromExecutionId: string | null;
  steps: WorkflowStepExecution[];
}

export interface WorkflowExecutionPage {
  items: WorkflowExecutionSummary[];
  nextCursor: string | null;
}

export type WorkflowExecutionSummary = Omit<WorkflowExecution, 'steps'>;
