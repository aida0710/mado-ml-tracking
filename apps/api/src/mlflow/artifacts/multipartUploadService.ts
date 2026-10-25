import type { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { User } from '@mmt/contracts';
import type { ArtifactStores } from '@mmt/platform';
import { first, transaction, type Database } from '../../db/database.js';
import { DomainError } from '../../domain/errors.js';
import { userColumns } from '../../repositories/identityRepository.js';
import type { ArtifactUploadRecord } from '../../repositories/artifactUploadRepository.js';
import type { ArtifactUploadRegisteredHook } from '../../services/artifactUploadFinalizer.js';
import type { ArtifactUploadService } from '../../services/artifactUploadService.js';
import { requireArtifactOwner, requireArtifactProject } from './artifactAccess.js';
import { nativeArtifactPath, validateArtifactOwner } from './artifactPath.js';
import {
  replaceArtifactPath,
  requireNonconflictingArtifactPath,
} from './artifactPathRepository.js';
import type { ArtifactAccess, ArtifactLocation, ArtifactOwner } from './artifactTypes.js';
import { readStoredMlmodel, saveLoggedModelMlmodel } from './mlmodelCapture.js';
import { partEtag } from './multipartProtocol.js';
import { MultipartUploadUnsupportedError } from './multipartUnsupported.js';
import type { CheckpointService } from '../../services/checkpointService.js';
import { indexMlflowMediaArtifact } from '../../services/runMediaIndexer.js';

// finalizerは毎秒ポーリングするので、これより短い間隔はクエリを増やすだけ。
const FINALIZE_POLL_MS = 250;

type MultipartAccess = ArtifactAccess & { path: string };
type WritableOwner = { kind: 'run' | 'model'; id: string };

/**
 * Artifactのアップロードセッションの上に作った、MLflowのプロキシ経由のマルチパートアップロード
 * （mpu/create、partのPUT、complete、abort）。sessionはArtifactのパスの所有者を持つ。finalizerが
 * Artifactを登録するとき、mapRegisteredArtifactが同じトランザクションでMLflowのパスをそれに
 * 対応付ける。
 */
export class MlflowMultipartUploadService {
  constructor(
    private readonly options: {
      database: Database;
      stores: ArtifactStores;
      uploads: ArtifactUploadService;
      /** MMT_UPLOAD_FINALIZE_WAIT_MS: 検証がこれより長くかかるとcompleteは503を返す。 */
      finalizeWaitMs: number;
      // checkpoints/step-<N>/のファイルを1回のPUTで送ったときと同じcheckpointの登録。
      checkpoints?: CheckpointService;
    },
  ) {}

  async create(
    request: MultipartAccess & { partCount: number },
  ): Promise<{ uploadId: string; partToken: string; partCount: number }> {
    const location = writableLocation(request);
    // 空のファイルにはpartが無い。SDKはこの応答の後、通常のPUTでそれを送る。
    if (request.partCount === 0) throw new MultipartUploadUnsupportedError();
    const nativePath = nativeArtifactPath(location);
    const authorized = await transaction(this.options.database, async (connection) => {
      const identity = await requireArtifactProject(connection, location, {
        write: true,
        lock: true,
      });
      const owner = await requireArtifactOwner(connection, location, { write: true, lock: true });
      await requireNonconflictingArtifactPath(connection, location);
      return { identity, runId: owner.runId };
    });
    try {
      const { upload, partToken } = await this.options.uploads.createOwned(
        authorized.identity,
        location.projectId,
        {
          path: nativePath,
          runId: authorized.runId,
          partCount: request.partCount,
          owner: location.owner,
        },
      );
      return { uploadId: upload.id, partToken, partCount: upload.partCount };
    } catch (error) {
      if (error instanceof DomainError && error.code === 'multipart_unsupported')
        throw new MultipartUploadUnsupportedError();
      throw error;
    }
  }

  /** part tokenだけで認可する。SDKはpartのリクエストをAuthorizationなしで送る。 */
  async uploadPart(part: {
    projectId: string;
    uploadId: string;
    partNumber: number;
    partToken: string | undefined;
    declaredBytes?: number;
    body: Readable;
  }): Promise<{ etag: string }> {
    const stored = await this.options.uploads.putPartWithToken(part.projectId, part);
    return { etag: partEtag(stored.sha256) };
  }

  /**
   * MLflowはcompleteを同期的なものとして扱う。戻ったときにはファイルが一覧に出ていなければ
   * ならない。ここでは、別のAPIのプロセスで動くかもしれないfinalizerがArtifactを登録するのを待つ。
   */
  async complete(
    request: MultipartAccess & {
      uploadId: string;
      parts: { partNumber: number; sha256: string | null }[];
    },
  ): Promise<void> {
    const location = writableLocation(request);
    const upload = await this.options.uploads.completeOwned(request.principal, location.projectId, {
      uploadId: request.uploadId,
      parts: request.parts,
      authorize: async (connection, session) => {
        assertSessionTarget(session, location);
        await requireArtifactProject(connection, location, { write: true, lock: true });
        const owner = await requireArtifactOwner(connection, location, { write: true, lock: true });
        if (owner.runId !== session.runId)
          throw new DomainError({
            status: 409,
            code: 'conflict',
            message: 'the source run of the artifact has changed',
          });
        await requireNonconflictingArtifactPath(connection, location);
      },
    });
    // 再試行したcompleteはauthorizeを飛ばすが、それでもsession自身の対象を指す必要がある。
    assertSessionTarget(upload, location);
    await this.waitUntilRegistered(location.projectId, upload.id);
  }

  async abort(request: ArtifactAccess & { uploadId: string }): Promise<void> {
    await this.options.uploads.abortOwned(request.principal, request.projectId, request.uploadId);
  }

  /** finalizerのフック。Artifactを登録するトランザクションの中でMLflowのパスを対応付ける。 */
  readonly mapRegisteredArtifact: ArtifactUploadRegisteredHook = async (
    connection,
    upload,
    artifact,
  ) => {
    if (!upload.ownerKind || !upload.ownerId) return;
    const owner: WritableOwner = { kind: upload.ownerKind, id: upload.ownerId };
    const creator = await first<User>(
      connection,
      `SELECT ${userColumns} FROM users u WHERE u.id=$1`,
      [upload.createdByUserId],
    );
    // 所有者の検査が読むのは所有者だけ。作成者のアクセスはcompleteのときに確かめた。
    const access: MultipartAccess = {
      principal: { user: creator!, method: 'session', token: null },
      projectId: upload.projectId,
      owner,
      path: mlflowArtifactPath(upload.path, owner),
    };
    // 例外を投げるとsessionは検証中のまま残る。finalizerが再試行し、最後には失敗にする。
    const { runId } = await requireArtifactOwner(connection, access, { write: true, lock: true });
    if (runId !== upload.runId)
      throw new DomainError({
        status: 409,
        code: 'conflict',
        message: 'the source run of the artifact has changed',
      });
    await requireNonconflictingArtifactPath(connection, access);
    await replaceArtifactPath(connection, { ...access, artifact, runId });
    if (owner.kind === 'run') {
      await this.options.checkpoints?.recordMlflowArtifact(connection, {
        projectId: upload.projectId,
        runId: owner.id,
        artifact,
        artifactPath: access.path,
      });
      // 1回のPUTと同じメディアの索引を作るので、大きいlog_imageのファイルもバックフィルなしで
      // 表示に出る。
      await indexMlflowMediaArtifact(connection, {
        projectId: upload.projectId,
        runId: owner.id,
        artifactId: artifact.id,
        path: access.path,
      });
    }
    if (owner.kind === 'model' && access.path === 'MLmodel')
      await saveLoggedModelMlmodel(connection, {
        projectId: upload.projectId,
        id: owner.id,
        metadata: await readStoredMlmodel({
          size: artifact.size,
          open: async () =>
            (await this.options.stores.read({ backend: upload.backend, key: upload.storageKey }))
              .body,
        }),
      });
  };

  private async waitUntilRegistered(projectId: string, uploadId: string): Promise<void> {
    const deadline = Date.now() + this.options.finalizeWaitMs;
    for (;;) {
      const session = await first<{ status: string; error: string | null }>(
        this.options.database,
        'SELECT status,error FROM artifact_uploads WHERE project_id=$1 AND id=$2',
        [projectId, uploadId],
      );
      if (session?.status === 'completed') return;
      if (session?.status === 'failed') throw finalizeFailure(session.error);
      if (session?.status !== 'verifying')
        throw new DomainError({
          status: 409,
          code: 'upload_not_open',
          message: 'this upload session cannot be completed',
        });
      if (Date.now() >= deadline)
        throw new DomainError({
          status: 503,
          code: 'upload_finalize_pending',
          message: 'the artifact is still being verified; it appears in the list when done',
        });
      await delay(FINALIZE_POLL_MS);
    }
  }
}

function writableLocation<T extends MultipartAccess>(request: T): T & { owner: WritableOwner } {
  const owner = validateArtifactOwner(request.owner);
  if (owner.kind === 'model-version')
    throw new DomainError({
      status: 409,
      code: 'conflict',
      message: 'artifacts of a registered model version cannot be changed',
    });
  return { ...request, owner: { kind: owner.kind, id: owner.id } };
}

/** MLflowの所有者から見たArtifactのパス。Logged Modelのファイルはmodels/<id>/の下にある。 */
function mlflowArtifactPath(nativePath: string, owner: ArtifactOwner): string {
  return owner.kind === 'model' ? nativePath.slice(`models/${owner.id}/`.length) : nativePath;
}

function assertSessionTarget(upload: ArtifactUploadRecord, location: ArtifactLocation): void {
  if (
    upload.ownerKind !== location.owner.kind ||
    upload.ownerId !== location.owner.id ||
    upload.path !== nativeArtifactPath(location)
  )
    throw new DomainError({
      status: 422,
      code: 'invalid_request',
      message: 'upload_id does not match the destination artifact path',
    });
}

function finalizeFailure(error: string | null): DomainError {
  switch (error) {
    case 'size_mismatch':
    case 'sha256_mismatch':
      return new DomainError({
        status: 422,
        code: error,
        message: 'the combined content of the received parts could not be verified',
      });
    case 'part_too_small':
      return new DomainError({
        status: 422,
        code: error,
        message: 'a part other than the last is smaller than the minimum part size of the storage',
      });
    case 'run_deleted':
      return new DomainError({
        status: 409,
        code: error,
        message: 'artifacts cannot be registered to a deleted run',
      });
    default:
      return new DomainError({
        status: 503,
        code: 'artifact_save_failed',
        message: 'failed to register the artifact',
      });
  }
}
