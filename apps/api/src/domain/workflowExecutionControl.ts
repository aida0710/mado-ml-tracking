import type { ProjectRole } from '@mmt/contracts';
import { DomainError } from './errors.js';
import { controlsStartedWork } from './startedWorkControl.js';

/**
 * ワークフローの実行を止める・そこから再開するのは、JobやSweepと同じく（controlsStartedWork）、
 * 始めた人とProject adminだけ。再開はステップのJobの再試行の代わりになり、再試行もその人たち
 * しかできないため。
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
