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
  throw new DomainError(
    403,
    'Jobを停止・再実行できるのは、作成者かProject adminだけです',
    'job_owner_required',
  );
}
