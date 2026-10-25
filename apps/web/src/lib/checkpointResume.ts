import type {
  Job,
  JsonObject,
  Run,
  RunCheckpointArtifact,
  RunResumeCheckpointRecord,
  JobStatus,
} from '@mmt/contracts';

// 続きがあるのは中断した学習だけ。終了したRunは最初から再試行する。
// JobとそのRunは同じ状態で終わるので、この判定はどちらを読んでもよい。
const RESUMABLE_STATUSES: readonly JobStatus[] = ['failed', 'canceled'];

/** この状態のRunやJobが、Runのcheckpointのどれかから続けられるか。 */
export function isResumableStatus(status: JobStatus): boolean {
  return RESUMABLE_STATUSES.includes(status);
}

/** checkpointの一覧が再開について出すもの。getCheckpointResumeOfferを参照。 */
export type CheckpointResumeOffer = 'resume' | 'creatorOnly' | 'none';

/**
 * 停止したRunについてcheckpointの一覧が出すもの。'resume'のボタンか、RunのJobを再試行できない
 * 人には'creatorOnly'（ボタンの代わりに理由を出す）。それ以外は'none'。再開はJobの再試行で、
 * できるのはJobの作成者とProject adminだけ（lib/permissionsのcanControlJobにRunのcreatedByを渡す）。
 * Jobも停止している必要がある。最終的な判断はAPIが行う。
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
 * Run.environment.resumeを読む。Runをcheckpointに固定したときにサーバーが書く。ふつうのRunや、
 * 契約の形をしていない記録ではnullを返す。
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

/** Run（Runそのものか、検索結果の要約）がcheckpointから続いているか。 */
export function isResumedRun(run: Pick<Run, 'resumeCheckpointId'>): boolean {
  return Boolean(run.resumeCheckpointId);
}

/** `runs`のうち、checkpointから続いているRunのid。 */
export function collectResumedRunIds(
  runs: readonly Pick<Run, 'id' | 'resumeCheckpointId'>[],
): Set<string> {
  return new Set(runs.filter(isResumedRun).map((run) => run.id));
}

/** checkpointのArtifactをダウンロードするときに付けるファイル名。パスにはフォルダが含まれうる。 */
export function getCheckpointArtifactFileName(
  artifact: Pick<RunCheckpointArtifact, 'path'>,
): string {
  return artifact.path.split('/').pop() || artifact.path;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
