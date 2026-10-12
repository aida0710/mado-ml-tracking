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
  throw new DomainError(
    403,
    'ワークフローの実行を停止・再開できるのは、作成者かProject adminだけです',
    'workflow_control_forbidden',
  );
}
