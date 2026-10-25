import type { ProjectRole } from '@mmt/contracts';
import { DomainError } from './errors.js';
import { controlsStartedWork } from './startedWorkControl.js';

/**
 * Stopping or retrying a Job belongs to the creator of its Run and to Project admins, as with
 * Sweeps (controlsStartedWork).
 */
export function assertControlsJob(
  caller: { role: ProjectRole; userId: string },
  run: { createdBy: string },
): void {
  if (controlsStartedWork(caller, run)) return;
  throw new DomainError({
    status: 403,
    code: 'job_owner_required',
    message: 'only the creator of the job or a project admin can stop or retry it',
  });
}
