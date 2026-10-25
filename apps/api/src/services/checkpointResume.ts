import type {
  Run,
  RunCheckpoint,
  RunResumeCheckpointRecord,
  WorkerResumeCheckpoint,
} from '@mmt/contracts';
import type { Connection } from '../db/database.js';
import { assertResumableFrom, type JobRetryInput } from '../domain/checkpointValidation.js';
import { DomainError } from '../domain/errors.js';
import {
  findCheckpoint,
  findLatestCheckpointId,
  findRunCodeLineage,
  pinRunResumeCheckpoint,
} from '../repositories/checkpointRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import { INPUT_CHECKPOINT_TAG } from '../domain/serverRunTags.js';

// 保存したcheckpointから新しいRunを続けるための処理。呼び出し側は、自分の認可を済ませたあと、
// RunのJobを挿入する前に、Runを作るトランザクションの中でこれらを呼ぶ。

/**
 * Jobの再試行が続きから始めるcheckpoint。指定されたものか、再試行するRunのstepが最大のもの。
 * 再試行するRunが1つも保存していなければ、そのRunが再開に使ったcheckpointから続ける。
 */
export async function selectRetryCheckpoint(
  connection: Connection,
  retry: { projectId: string; previousRun: Run; request: JobRetryInput },
): Promise<string | null> {
  const { previousRun, request } = retry;
  if (request.checkpointId) return request.checkpointId;
  if (!request.resumeFromLatestCheckpoint) return null;
  const latest =
    (await findLatestCheckpointId(connection, {
      projectId: retry.projectId,
      runId: previousRun.id,
    })) ?? previousRun.resumeCheckpointId;
  if (!latest)
    throw new DomainError({
      status: 422,
      code: 'checkpoint_not_found',
      message: 'there is no checkpoint to resume from',
    });
  return latest;
}

/**
 * このトランザクションで（Jobより前に）作ったRunをcheckpointに固定する。設定するのは
 * resume_checkpoint_id、environment.resume、それに呼び出し側が選んでいなければ
 * parentRunId = checkpointのRun。
 */
export async function pinResumeCheckpoint(
  connection: Connection,
  pin: { run: Run; checkpointId: string },
): Promise<Run> {
  const { run } = pin;
  const checkpoint = await findCheckpoint(connection, {
    projectId: run.projectId,
    id: pin.checkpointId,
  });
  assertResumableFrom(
    await findRunCodeLineage(connection, { projectId: run.projectId, runId: checkpoint.runId }),
    await findRunCodeLineage(connection, { projectId: run.projectId, runId: run.id }),
  );
  assertCheckpointArtifactsSaved(checkpoint);
  const resume: RunResumeCheckpointRecord = {
    checkpointId: checkpoint.id,
    sourceRunId: checkpoint.runId,
    step: checkpoint.step,
  };
  await pinRunResumeCheckpoint(connection, {
    runId: run.id,
    checkpointId: checkpoint.id,
    resume,
    parentRunId: checkpoint.runId,
  });
  return findRun(connection, { projectId: run.projectId, id: run.id });
}

/** 固定したRunのWorkerJob.resumeCheckpoint。Runが最初から始まるならnull。 */
export async function findWorkerResumeCheckpoint(
  connection: Connection,
  run: Run,
): Promise<WorkerResumeCheckpoint | null> {
  if (!run.resumeCheckpointId) return null;
  return workerCheckpoint(connection, { projectId: run.projectId, id: run.resumeCheckpointId });
}

/**
 * WorkerJob.inputCheckpoint。checkpoint_savedのフックがこのRunを始めるもとになったcheckpoint
 * （予約済みのtag）で、再開する状態ではなく入力としてコンテナに渡す。
 */
export async function findWorkerInputCheckpoint(
  connection: Connection,
  run: Run,
): Promise<WorkerResumeCheckpoint | null> {
  const checkpointId = run.tags[INPUT_CHECKPOINT_TAG];
  if (!checkpointId) return null;
  return workerCheckpoint(connection, { projectId: run.projectId, id: checkpointId });
}

async function workerCheckpoint(
  connection: Connection,
  reference: { projectId: string; id: string },
): Promise<WorkerResumeCheckpoint> {
  const checkpoint = await findCheckpoint(connection, reference);
  assertCheckpointArtifactsSaved(checkpoint);
  return {
    id: checkpoint.id,
    runId: checkpoint.runId,
    step: checkpoint.step,
    source: checkpoint.source,
    artifacts: checkpoint.artifacts,
    manifest: checkpoint.manifest,
    metadata: checkpoint.metadata,
  };
}

// Artifactの行は中身を保存してから書くので、行が無ければファイルが失われている。
function assertCheckpointArtifactsSaved(checkpoint: RunCheckpoint): void {
  if (checkpoint.artifacts.length !== checkpoint.artifactIds.length)
    throw new DomainError({
      status: 422,
      code: 'checkpoint_artifact_missing',
      message: 'the artifact of the checkpoint is not stored',
    });
}
