import type { ProjectRole } from '@mmt/contracts';
import { DomainError } from './errors.js';
import { controlsStartedWork } from './startedWorkControl.js';

/**
 * Stopping a workflow execution, or resuming from it, belongs to the person who started it and to
 * Project admins, as with Jobs and Sweeps (controlsStartedWork): resuming replaces retrying the
 * step's Job, which only they may do.
 */
export function assertControlsWorkflowExecution(
  caller: { role: ProjectRole; userId: string },
  execution: { createdBy: string },
): void {
  if (controlsStartedWork(caller, execution)) return;
  throw new DomainError({
    status: 403,
    code: 'workflow_control_forbidden',
    message: 'only the creator of the workflow execution or a project admin can stop or resume it',
  });
}
