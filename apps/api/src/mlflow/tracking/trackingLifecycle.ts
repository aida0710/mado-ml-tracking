import type { RunStatus } from '@mmt/contracts';
import { conflict } from '../../domain/errors.js';
import { isResumeTransition } from '../../domain/runResume.js';
import { isTerminalStatus } from '../../domain/runTransitions.js';
import { nativeRunStatus, type MlflowRunStatus, type TrackingRun } from './trackingTypes.js';

export function resolveTrackingLifecycle(
  run: TrackingRun,
  input: { status?: MlflowRunStatus; endTime?: number | null; hasJob: boolean },
) {
  if (input.hasJob) {
    if (input.status === 'SCHEDULED' && run.status !== 'queued')
      conflict('a run managed by a job cannot be returned to the queue');
    // SDKのstart/endはSDK側の文脈を変えるだけ。Jobのライフサイクルはworkerが持つ。
    return { status: run.status, startedAt: run.startedAt, endedAt: run.endedAt };
  }
  const status = input.status ? nativeRunStatus[input.status] : run.status;
  const now = new Date().toISOString();
  const startedAt = status === 'running' ? (run.startedAt ?? now) : run.startedAt;
  let endedAt = run.endedAt;
  if (input.status === 'RUNNING') endedAt = null;
  else if (input.endTime != null) endedAt = new Date(input.endTime).toISOString();
  else if (isTerminalStatus(status)) endedAt ??= now;
  return { status, startedAt, endedAt };
}

/**
 * MLflowのstart_run(run_id=)は、前のend_timeを付けたままupdate-runでRUNNINGを送る（SDK 3.0.0と
 * 3.17.0で確認）。Jobの無いRunでは終了したRunを開き直し、ネイティブAPIと同じく再開として記録する。
 * Jobに属するRunは状態を保つので、再開しない。
 */
export function isTrackingResume(
  run: TrackingRun,
  next: { status: RunStatus; hasJob: boolean },
): boolean {
  return !next.hasJob && isResumeTransition(run, next.status);
}
