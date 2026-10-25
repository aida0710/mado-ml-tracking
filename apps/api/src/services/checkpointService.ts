import type { Artifact, Run, RunCheckpoint, RunCheckpointManifest } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Connection, type Database } from '../db/database.js';
import {
  assertCheckpointRunKind,
  CHECKPOINT_RUN_KINDS,
  parseMlflowCheckpointPath,
  type RunCheckpointCreateInput,
} from '../domain/checkpointValidation.js';
import { DomainError, notFound } from '../domain/errors.js';
import { isTerminalStatus } from '../domain/runTransitions.js';
import {
  checkpointStepExists,
  findCheckpoint,
  findMlflowCheckpointForUpdate,
  findSavedArtifacts,
  hideCheckpointsBeyond,
  insertCheckpoint,
  listRunCheckpoints,
  updateMlflowCheckpointFiles,
} from '../repositories/checkpointRepository.js';
import { findRun } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import { notifyListener } from './eventListeners.js';
import { assertRunRecordsWritable } from './runService.js';

type RunReference = { projectId: string; runId: string };

/**
 * POST /runs/:r/checkpointsで保存されたcheckpointの通知を受ける（triggerがcheckpoint_savedの
 * フック）。MLflowのcheckpointは通知しない。ファイルが1つずつ届き、最後の1つが届いたことを
 * 知らせるものが無いため。
 */
export interface CheckpointListener {
  readonly name: string;
  onCheckpointSaved(
    connection: Connection,
    saved: { checkpoint: RunCheckpoint; run: Run },
  ): Promise<void>;
}

export class CheckpointService {
  constructor(
    private readonly database: Database,
    private readonly retention: { keepCount: number },
    // 参照で持つ。app.tsがフックを作り終えてから足す。
    private readonly listeners: readonly CheckpointListener[] = [],
  ) {}

  async list(
    principal: Principal,
    query: RunReference & { includeHidden: boolean },
  ): Promise<RunCheckpoint[]> {
    await requireProject(this.database, principal, {
      projectId: query.projectId,
      role: 'viewer',
      scope: 'read',
    });
    await findRun(this.database, { projectId: query.projectId, id: query.runId });
    return listRunCheckpoints(this.database, query);
  }

  async create(
    principal: Principal,
    reference: RunReference,
    input: RunCheckpointCreateInput,
  ): Promise<RunCheckpoint> {
    return transaction(this.database, async (connection) => {
      await requireCheckpointWriter(connection, principal, reference);
      const run = await findRun(connection, {
        projectId: reference.projectId,
        id: reference.runId,
        lock: true,
      });
      assertCheckpointRunKind(run.kind);
      await assertRunRecordsWritable(connection, run);
      const [artifact] = await findSavedArtifacts(connection, {
        projectId: reference.projectId,
        ids: [input.artifactId],
      });
      if (!artifact) notFound('artifact');
      if (artifact.runId !== run.id)
        throw new DomainError({
          status: 422,
          code: 'checkpoint_artifact_run',
          message: 'a checkpoint must use an artifact stored in the same run',
        });
      if (await checkpointStepExists(connection, { runId: run.id, step: input.step }))
        throw new DomainError({
          status: 409,
          code: 'checkpoint_exists',
          message: 'a checkpoint for this step is already registered',
        });
      const id = await insertCheckpoint(connection, {
        projectId: reference.projectId,
        runId: run.id,
        step: input.step,
        source: 'native',
        artifactIds: [artifact.id],
        manifest: {
          files: input.manifest.files,
          includesOptimizer: input.manifest.includesOptimizer,
          framework: input.manifest.framework ?? null,
        },
        metadata: input.metadata,
      });
      await hideCheckpointsBeyond(connection, {
        runId: run.id,
        keepCount: this.retention.keepCount,
      });
      const checkpoint = await findCheckpoint(connection, { projectId: reference.projectId, id });
      for (const listener of this.listeners)
        await notifyListener(connection, {
          listener: listener.name,
          subjectId: checkpoint.id,
          notify: () => listener.onCheckpointSaved(connection, { checkpoint, run }),
        });
      return checkpoint;
    });
  }

  /**
   * MLflowのArtifactを保存するときのフックから、ファイルを登録するトランザクションの中で呼ばれる。
   * checkpoints/step-<N>/の最初のファイルがcheckpointを作り、後のファイルはそのmanifestに足す。
   * Runが終わるとcheckpointは確定し、それ以降のファイルは拒む。
   */
  async recordMlflowArtifact(
    connection: Connection,
    saved: { projectId: string; runId: string; artifact: Artifact; artifactPath: string },
  ): Promise<void> {
    const location = parseMlflowCheckpointPath(saved.artifactPath);
    if (!location) return;
    const run = await findRun(connection, { projectId: saved.projectId, id: saved.runId });
    // ほかの種類のRunが、同じ名前のディレクトリを無関係なファイルに使うことがある。
    if (!CHECKPOINT_RUN_KINDS.includes(run.kind)) return;
    const file = {
      path: location.relativePath,
      sha256: saved.artifact.sha256,
      size: saved.artifact.size,
    };
    const existing = await findMlflowCheckpointForUpdate(connection, {
      projectId: saved.projectId,
      runId: run.id,
      step: location.step,
    });
    if (existing?.final || (isTerminalStatus(run.status) && !existing))
      throw new DomainError({
        status: 409,
        code: 'checkpoint_finalized',
        message: 'files cannot be added to a checkpoint of a finished run',
      });
    if (existing) {
      await this.replaceMlflowCheckpointFile(connection, {
        projectId: saved.projectId,
        checkpoint: existing,
        artifactId: saved.artifact.id,
        file,
      });
      return;
    }
    // このstepには既にネイティブのcheckpointがある。MLflowのファイルは普通のArtifactのままにする。
    if (await checkpointStepExists(connection, { runId: run.id, step: location.step })) return;
    await insertCheckpoint(connection, {
      projectId: saved.projectId,
      runId: run.id,
      step: location.step,
      source: 'mlflow',
      artifactIds: [saved.artifact.id],
      manifest: { files: [file], includesOptimizer: false, framework: null },
      metadata: {},
    });
    await hideCheckpointsBeyond(connection, {
      runId: run.id,
      keepCount: this.retention.keepCount,
    });
  }

  // 同じパスを記録し直すとそのファイルを置き換える。MLflowの同じパスのArtifactの上書きに合わせる。
  private async replaceMlflowCheckpointFile(
    connection: Connection,
    update: {
      projectId: string;
      checkpoint: { id: string; artifactIds: string[]; manifest: RunCheckpointManifest };
      artifactId: string;
      file: RunCheckpointManifest['files'][number];
    },
  ): Promise<void> {
    const { checkpoint, file } = update;
    const previous = await findSavedArtifacts(connection, {
      projectId: update.projectId,
      ids: checkpoint.artifactIds,
    });
    const replacedIds = new Set(
      previous
        .filter((artifact) => parseMlflowCheckpointPath(artifact.path)?.relativePath === file.path)
        .map((artifact) => artifact.id),
    );
    await updateMlflowCheckpointFiles(connection, {
      id: checkpoint.id,
      artifactIds: [...checkpoint.artifactIds.filter((id) => !replacedIds.has(id)), update.artifactId],
      manifest: {
        ...checkpoint.manifest,
        files: [...checkpoint.manifest.files.filter((entry) => entry.path !== file.path), file],
      },
    });
  }
}

/**
 * ユーザーにはeditorとしてのruns:writeが要る。Jobの中のコードはJob tokenでここに来るが、Job tokenの
 * ガードが既に自分のRunだけに絞っている。worker tokenは、今持っているJobのRunに登録してよい。
 */
async function requireCheckpointWriter(
  connection: Connection,
  principal: Principal,
  reference: RunReference,
): Promise<void> {
  const token = principal.token;
  if (
    principal.method === 'token' &&
    token?.projectId === reference.projectId &&
    token.scopes.includes('worker:execute') &&
    !token.scopes.includes('runs:write')
  ) {
    await requireProject(connection, principal, {
      projectId: reference.projectId,
      role: 'editor',
      scope: 'worker:execute',
    });
    const heldJob = await first(
      connection,
      `SELECT id FROM jobs WHERE project_id=$1 AND run_id=$2 AND worker_token_id=$3
      AND status IN ('claimed','running')`,
      [reference.projectId, reference.runId, token.id],
    );
    if (!heldJob)
      throw new DomainError({
        status: 403,
        code: 'checkpoint_forbidden',
        message: 'a worker token can register checkpoints only on the run of a running job',
      });
    return;
  }
  await requireProject(connection, principal, {
    projectId: reference.projectId,
    role: 'editor',
    scope: 'runs:write',
  });
}
