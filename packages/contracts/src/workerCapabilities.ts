/**
 * Features a worker names in workerInfo.capabilities on claim and resume. A Job that needs one
 * goes only to a worker that named it, so an older worker never runs it while silently ignoring
 * what it does not understand.
 * - `workflowDatasetUsage`: hands a workflow step its dataset usage (MMT_DATASET_USAGE_FILE) and
 *   execution (MMT_WORKFLOW_EXECUTION_ID); without it a step would train on every input with no
 *   role, weight or selection while the API records that it used them.
 */
export const WORKER_CAPABILITIES = ['workflowDatasetUsage'] as const;
export type WorkerCapability = (typeof WORKER_CAPABILITIES)[number];
