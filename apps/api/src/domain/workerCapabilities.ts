import type { WorkerCapability } from '@mmt/contracts';

// A workflow step's Run carries its dataset usage and execution in the environment, which only a
// worker that names this capability hands to the step's code.
const WORKFLOW_STEP_CAPABILITY: WorkerCapability = 'workflowDatasetUsage';

/**
 * SQL for the capabilities (text[]) a worker must have named to take a Job of the runs row
 * aliased `run`. The claim and the Job list share it, so the list tells why a Job waits.
 */
export function requiredWorkerCapabilitiesSql(run: string): string {
  return `(CASE WHEN ${run}.environment ? 'workflow' THEN ARRAY['${WORKFLOW_STEP_CAPABILITY}']
    ELSE ARRAY[]::text[] END)`;
}
