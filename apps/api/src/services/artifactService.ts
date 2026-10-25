import { randomUUID } from 'node:crypto';
import { pipeline, type Readable } from 'node:stream';
import type { Artifact, ArtifactPage, ArtifactTree } from '@mmt/contracts';
import {
  ArtifactNotFoundError,
  ArtifactRangeError,
  type ArtifactContent,
  type ArtifactStores,
} from '@mmt/platform';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { resolveArtifactMimeType } from '../domain/artifactMimeType.js';
import { DomainError, notFound } from '../domain/errors.js';
import { findRun } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import {
  assertArtifactPath,
  projectArtifactBackend,
  registerStoredArtifact,
  type ArtifactStoredHook,
} from './artifactRegistration.js';
import {
  listProjectArtifacts,
  listRunArtifacts,
  runArtifactTree,
  type ProjectArtifactQuery,
  type RunArtifactQuery,
} from './artifactListing.js';
import {
  ArtifactSizeLimit,
  artifactTooLargeError,
  assertDeclaredArtifactSize,
} from './artifactSizeLimit.js';

export interface ArtifactLimits {
  maxBytes: number;
}

// サービスを直接作るテストダブルは上限を外す。アプリは設定した上限を渡す。
const UNLIMITED: ArtifactLimits = { maxBytes: Number.POSITIVE_INFINITY };

export class ArtifactService {
  constructor(
    private readonly database: Database,
    readonly stores: ArtifactStores,
    private readonly limits: ArtifactLimits = UNLIMITED,
  ) {}

  async listProject(principal: Principal, filter: ProjectArtifactQuery): Promise<ArtifactPage> {
    await requireProject(this.database, principal, {
      projectId: filter.projectId,
      role: 'viewer',
      scope: 'read',
    });
    return listProjectArtifacts(this.database, filter);
  }

  async getMetadata(
    principal: Principal,
    projectId: string,
    artifactId: string,
  ): Promise<Artifact> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const artifact = await first<Artifact>(
      this.database,
      'SELECT * FROM artifacts WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL',
      [artifactId, projectId],
    );
    if (!artifact) notFound('artifact');
    return artifact;
  }

  async list(principal: Principal, query: RunArtifactQuery): Promise<ArtifactPage> {
    await this.requireRunReader(principal, query);
    return listRunArtifacts(this.database, query);
  }

  async tree(
    principal: Principal,
    location: { projectId: string; runId: string; prefix: string },
  ): Promise<ArtifactTree> {
    await this.requireRunReader(principal, location);
    return runArtifactTree(this.database, location);
  }

  private async requireRunReader(
    principal: Principal,
    location: { projectId: string; runId: string },
  ): Promise<void> {
    await requireProject(this.database, principal, {
      projectId: location.projectId,
      role: 'viewer',
      scope: 'read',
    });
    await findRun(this.database, { projectId: location.projectId, id: location.runId });
  }

  async upload(
    principal: Principal,
    projectId: string,
    upload: {
      runId?: string;
      path: string;
      mimeType?: string;
      /** クライアントが宣言したときの、リクエストのContent-Length。 */
      declaredBytes?: number;
      body: Readable;
      onStored?: ArtifactStoredHook;
    },
  ): Promise<Artifact> {
    await requireProject(this.database, principal, {
      projectId,
      role: 'editor',
      scope: 'artifacts:write',
    });
    assertArtifactPath(upload.path);
    if (upload.runId) await findRun(this.database, { projectId, id: upload.runId });
    assertDeclaredArtifactSize(upload.declaredBytes, this.limits.maxBytes);
    const backend = await projectArtifactBackend(this.database, projectId, this.stores);
    const id = randomUUID();
    const key = `${projectId}/${id}/content`;
    const reference = { backend, key };
    const mimeType = resolveArtifactMimeType({
      path: upload.path,
      declaredMimeType: upload.mimeType,
    });
    const sizeLimit = new ArtifactSizeLimit(this.limits.maxBytes);
    // 上限に達するとpipeline()がリクエストのストリームを破棄するので、残りは読まない。
    const limitedBody = pipeline(upload.body, sizeLimit, () => undefined);
    try {
      const stored = await this.stores.put({ ...reference, body: limitedBody, mimeType });
      return await transaction(this.database, async (connection) => {
        // ストリームでの書き込みは長くかかることがあるので、そのあとで権限とRunの参照を確かめ直す。
        await requireProject(connection, principal, {
          projectId,
          role: 'editor',
          scope: 'artifacts:write',
        });
        if (upload.runId) await findRun(connection, { projectId, id: upload.runId });
        return registerStoredArtifact(
          connection,
          {
            id,
            projectId,
            runId: upload.runId ?? null,
            path: upload.path,
            backend: reference.backend,
            storageKey: key,
            mimeType,
            size: stored.size,
            sha256: stored.sha256,
          },
          { stores: this.stores, onStored: upload.onStored },
        );
      });
    } catch (error) {
      try {
        await this.stores.remove(reference);
      } catch {
        // 保存場所や認証情報はログに出さない。後片付けの対象は変わらないidで特定できる。
        console.error(
          JSON.stringify({ event: 'artifact_cleanup_failed', artifactId: id, projectId }),
        );
      }
      // storeは中断されたpipelineを、上限のエラーでなく自分のエラーとして報告することがある。
      if (sizeLimit.isExceeded) throw artifactTooLargeError(this.limits.maxBytes);
      if (error instanceof DomainError) throw error;
      throw new DomainError({
        status: 503,
        code: 'artifact_save_failed',
        message: 'failed to save the artifact',
      });
    }
  }

  async content(
    principal: Principal,
    projectId: string,
    download: { artifactId: string; range?: string },
  ): Promise<{ artifact: Artifact; content: ArtifactContent }> {
    const artifact = await this.getMetadata(principal, projectId, download.artifactId);
    return { artifact, content: await this.readContent(artifact, download.range) };
  }

  /** getMetadataで認可済みのArtifactを読む。呼び出し側はその確認を省いてはならない。 */
  async readContent(artifact: Artifact, range?: string): Promise<ArtifactContent> {
    try {
      return await this.stores.read({
        backend: artifact.backend,
        key: artifact.storageKey,
        range,
      });
    } catch (error) {
      if (error instanceof ArtifactRangeError) throw error;
      if (error instanceof ArtifactNotFoundError)
        throw new DomainError({
          status: 404,
          code: 'artifact_content_not_found',
          message: 'the artifact file was not found',
        });
      throw new DomainError({
        status: 503,
        code: 'artifact_read_failed',
        message: 'cannot read the artifact',
      });
    }
  }
}
