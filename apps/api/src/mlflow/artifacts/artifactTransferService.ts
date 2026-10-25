import { transaction, type Database } from '../../db/database.js';
import { DomainError, notFound } from '../../domain/errors.js';
import {
  ARTIFACT_DELETE_PERMISSION,
  type ArtifactDeletionService,
} from '../../services/artifactDeletionService.js';
import type { ArtifactService } from '../../services/artifactService.js';
import { requireProject } from '../../services/accessService.js';
import type { CheckpointService } from '../../services/checkpointService.js';
import { indexMlflowMediaArtifact } from '../../services/runMediaIndexer.js';
import { requireArtifactOwner, requireArtifactProject } from './artifactAccess.js';
import { listArtifactDirectory } from './artifactListing.js';
import { nativeArtifactPath, validateArtifactOwner, validateArtifactPath } from './artifactPath.js';
import {
  findArtifactPath,
  listArtifactPaths,
  replaceArtifactPath,
  requireNonconflictingArtifactPath,
} from './artifactPathRepository.js';
import type { ArtifactAccess, ArtifactFile, ArtifactUpload } from './artifactTypes.js';
import { MlmodelCapture, saveLoggedModelMlmodel } from './mlmodelCapture.js';
import { modelVersionArtifactManifest } from './modelVersionArtifactRepository.js';

export class ArtifactTransferService {
  private readonly database: Database;
  private readonly artifacts: ArtifactService;
  private readonly checkpoints?: CheckpointService;
  private readonly deletions: ArtifactDeletionService;

  constructor(options: {
    database: Database;
    artifacts: ArtifactService;
    // checkpoints/step-<N>/の下のファイルをRunのcheckpointとして登録する。省くテストには無い。
    checkpoints?: CheckpointService;
    deletions: ArtifactDeletionService;
  }) {
    this.database = options.database;
    this.artifacts = options.artifacts;
    this.checkpoints = options.checkpoints;
    this.deletions = options.deletions;
  }

  async list(access: ArtifactAccess & { path: string }): Promise<ArtifactFile[]> {
    access = { ...access, owner: validateArtifactOwner(access.owner) };
    const path = validateArtifactPath(access.path, { directory: true });
    await requireArtifactProject(this.database, access);
    if (access.owner.kind === 'model-version')
      return listArtifactDirectory(await modelVersionArtifactManifest(this.database, access), path);
    await requireArtifactOwner(this.database, access);
    return listArtifactDirectory(await listArtifactPaths(this.database, access), path);
  }

  async upload(upload: ArtifactUpload): Promise<void> {
    let capture: MlmodelCapture | null = null;
    // 認可がDBを待つ間に、受信中のストリームが失敗しうる。それでもpipelineはエラーになった
    // ストリームを検知する。
    upload.body.on('error', () => undefined);
    try {
      upload = { ...upload, owner: validateArtifactOwner(upload.owner) };
      if (upload.owner.kind === 'model-version')
        throw new DomainError({
          status: 409,
          code: 'conflict',
          message: 'artifacts of a registered model version cannot be changed',
        });
      validateArtifactPath(upload.path);
      const path = nativeArtifactPath(upload);
      const authorized = await transaction(this.database, async (connection) => {
        const identity = await requireArtifactProject(connection, upload, {
          write: true,
          lock: true,
        });
        const owner = await requireArtifactOwner(connection, upload, { write: true, lock: true });
        await requireNonconflictingArtifactPath(connection, upload);
        return { identity, runId: owner.runId };
      });
      // 破棄した元のストリームは、新しくつないだcaptureのストリームに2度目のerror・endを送れない。
      if (upload.body.errored || (upload.body.destroyed && !upload.body.readableEnded))
        throw new DomainError({
          status: 503,
          code: 'artifact_save_failed',
          message: 'the artifact input stream was disconnected',
        });
      capture =
        upload.owner.kind === 'model' && upload.path === 'MLmodel' ? new MlmodelCapture() : null;
      if (capture) {
        const metadataStream = capture;
        // ArtifactServiceがpipelineを始める前の、受信中のストリームの早いエラーの扱いに合わせる。
        metadataStream.on('error', () => undefined);
        upload.body.on('error', (error) => metadataStream.destroy(error)).pipe(metadataStream);
      }
      await this.artifacts.upload(authorized.identity, upload.projectId, {
        runId: authorized.runId ?? undefined,
        path,
        mimeType: upload.mimeType,
        body: capture ?? upload.body,
        onStored: async (connection, artifact) => {
          await requireArtifactProject(connection, upload, { write: true, lock: true });
          const owner = await requireArtifactOwner(connection, upload, { write: true, lock: true });
          if (owner.runId !== authorized.runId)
            throw new DomainError({
              status: 409,
              code: 'conflict',
              message: 'the source run of the artifact has changed',
            });
          await requireNonconflictingArtifactPath(connection, upload);
          await replaceArtifactPath(connection, { ...upload, artifact, runId: authorized.runId });
          if (upload.owner.kind === 'run') {
            await this.checkpoints?.recordMlflowArtifact(connection, {
              projectId: upload.projectId,
              runId: upload.owner.id,
              artifact,
              artifactPath: upload.path,
            });
            await indexMlflowMediaArtifact(connection, {
              projectId: upload.projectId,
              runId: upload.owner.id,
              artifactId: artifact.id,
              path: upload.path,
            });
          }
          if (!capture) return;
          await saveLoggedModelMlmodel(connection, {
            projectId: upload.projectId,
            id: upload.owner.id,
            metadata: capture.metadata(),
          });
        },
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError({
        status: 503,
        code: 'artifact_save_failed',
        message: 'the stored reference of the artifact cannot be updated',
      });
    } finally {
      // 失敗したストリームを破棄すると、残りを読む代わりに受信中のリクエストも取り消す。
      capture?.destroy();
      upload.body.destroy();
    }
  }

  async content(access: ArtifactAccess & { path: string; range?: string }) {
    access = { ...access, owner: validateArtifactOwner(access.owner) };
    validateArtifactPath(access.path);
    const identity = await requireArtifactProject(this.database, access);
    if (access.owner.kind === 'model-version') {
      const manifest = await modelVersionArtifactManifest(this.database, access);
      const artifact = manifest.find((entry) => entry.path === access.path);
      if (!artifact) notFound('artifact');
      return this.artifacts.content(identity, access.projectId, {
        artifactId: artifact.artifactId,
        range: access.range,
      });
    }
    await requireArtifactOwner(this.database, access);
    const artifactId = await findArtifactPath(this.database, access);
    return this.artifacts.content(identity, access.projectId, { artifactId, range: access.range });
  }

  /**
   * MLflowのdelete_artifacts。RunかLogged Modelの、ファイル1つ、ディレクトリ1つ、または
   * （パスが''なら）すべてを消す。ネイティブの削除と同じくProject adminだけ。登録済みのモデル
   * バージョンやほかの記録が参照するArtifactは保存したまま残し、この所有者から消えるだけ。無い
   * パスはMLflowのサーバーと同じく成功にするので、リクエストを再試行しても害は無い。
   */
  async delete(access: ArtifactAccess & { path: string }): Promise<void> {
    access = { ...access, owner: validateArtifactOwner(access.owner) };
    if (access.owner.kind === 'model-version')
      throw new DomainError({
        status: 409,
        code: 'conflict',
        message: 'artifacts of a registered model version cannot be deleted',
      });
    const path = validateArtifactPath(access.path, { directory: true });
    await transaction(this.database, async (connection) => {
      const identity = await requireArtifactProject(connection, access, { lock: true });
      await requireProject(connection, identity, {
        projectId: access.projectId,
        ...ARTIFACT_DELETE_PERMISSION,
      });
      await requireArtifactOwner(connection, access, { lock: true });
      const deletion = { principal: identity, projectId: access.projectId, path };
      if (access.owner.kind === 'run')
        await this.deletions.deleteMlflowRunPath(connection, {
          ...deletion,
          runId: access.owner.id,
        });
      else
        await this.deletions.deleteMlflowModelPath(connection, {
          ...deletion,
          modelId: access.owner.id,
        });
    });
  }
}
