import type {
  Job,
  JsonObject,
  Run,
  RunCheckpointArtifact,
  RunResumeCheckpointRecord,
  JobStatus,
} from '@mmt/contracts';

// Only interrupted training has something to continue; a finished Run is retried from scratch.
// A Job and its Run end with the same status, so the rule reads either one.
const RESUMABLE_STATUSES: readonly JobStatus[] = ['failed', 'canceled'];

/** Whether a Run or Job with this status can continue from one of the Run's checkpoints. */
export function isResumableStatus(status: JobStatus): boolean {
  return RESUMABLE_STATUSES.includes(status);
}

/** What the checkpoint list shows for resuming; see getCheckpointResumeOffer. */
export type CheckpointResumeOffer = 'resume' | 'creatorOnly' | 'none';

/**
 * What the checkpoint list offers for a stopped Run: 'resume' buttons, or 'creatorOnly' (the
 * reason in their place) for someone who may not retry the Run's Job; 'none' otherwise. Resuming
 * retries the Job, which only its creator and Project admins may (lib/permissions canControlJob
 * with the Run's createdBy), and needs a Job that has stopped too. The API stays the authority.
 */
export function getCheckpointResumeOffer({
  run,
  job,
  canRetryJob,
}: {
  run: Pick<Run, 'status'>;
  job: Pick<Job, 'status'> | undefined;
  canRetryJob: boolean;
}): CheckpointResumeOffer {
  if (!isResumableStatus(run.status)) return 'none';
  if (!canRetryJob) return 'creatorOnly';
  return job && isResumableStatus(job.status) ? 'resume' : 'none';
}

/**
 * Reads Run.environment.resume, which the server writes when the Run is pinned to a checkpoint.
 * Returns null for an ordinary Run or a record that does not have the contract's shape.
 */
export function getResumeCheckpointRecord(
  run: Pick<Run, 'environment'>,
): RunResumeCheckpointRecord | null {
  const record = run.environment.resume;
  if (!isJsonObject(record)) return null;
  const { checkpointId, sourceRunId, step } = record;
  if (typeof checkpointId !== 'string' || typeof sourceRunId !== 'string') return null;
  if (typeof step !== 'number' || !Number.isInteger(step)) return null;
  return { checkpointId, sourceRunId, step };
}

/** Whether a Run (a full Run or a search summary) continues from a checkpoint. */
export function isResumedRun(run: Pick<Run, 'resumeCheckpointId'>): boolean {
  return Boolean(run.resumeCheckpointId);
}

/** Ids of the Runs among `runs` that continue from a checkpoint. */
export function collectResumedRunIds(
  runs: readonly Pick<Run, 'id' | 'resumeCheckpointId'>[],
): Set<string> {
  return new Set(runs.filter(isResumedRun).map((run) => run.id));
}

/** File name offered when downloading a checkpoint Artifact; its path may contain folders. */
export function getCheckpointArtifactFileName(
  artifact: Pick<RunCheckpointArtifact, 'path'>,
): string {
  return artifact.path.split('/').pop() || artifact.path;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
