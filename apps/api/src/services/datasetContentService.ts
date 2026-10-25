import {
  MAX_DATASET_VERSION_FILES,
  type Artifact,
  type ArtifactTree,
  type DatasetVersionFile,
  type DatasetVersionFilePage,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, type Connection, type Database } from '../db/database.js';
import type {
  DatasetFileListQuery,
  DatasetVersionContentInput,
} from '../domain/datasetContentValidation.js';
import { DomainError, notFound } from '../domain/errors.js';
import { findRun } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import {
  artifactTreeFromGroups,
  directoryPrefix,
  listRunArtifacts,
  MAX_TREE_DIRECTORIES,
  type ArtifactTreeGroup,
} from './artifactListing.js';
import type { DatasetManifestFile } from './datasetVersionRegistration.js';

export interface ResolvedDatasetContent {
  files: DatasetManifestFile[];
  /** そのArtifactがバージョンの中身になったRun。バージョンのsourceRunIdとして記録する。 */
  sourceRunId: string | null;
}

/**
 * 作成リクエストが指定したArtifactを探す。ArtifactはリクエストのProjectの中だけで探すので、
 * 別のProjectのArtifact IDは、存在しないIDとまったく同じに報告する。
 */
export async function resolveDatasetContent(
  connection: Connection,
  request: { projectId: string; content: DatasetVersionContentInput },
): Promise<ResolvedDatasetContent> {
  const { content, projectId } = request;
  if ('fromRunArtifacts' in content)
    return resolveRunArtifacts(connection, { projectId, ...content.fromRunArtifacts });
  const artifactIds = [...new Set(content.files.map((file) => file.artifactId))];
  const artifacts = await rows<Pick<Artifact, 'id' | 'size' | 'sha256'>>(
    connection,
    `SELECT id,size,sha256 FROM artifacts
    WHERE project_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL`,
    [projectId, artifactIds],
  );
  const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const missing = artifactIds.filter((id) => !artifactsById.has(id));
  if (missing.length)
    throw new DomainError({
      status: 422,
      code: 'dataset_artifact_not_found',
      message: `not artifacts stored in this project: ${missing.slice(0, 5).join(', ')}`,
      details: { artifactIds: missing.slice(0, 5) },
    });
  return {
    files: content.files.map((file) => {
      const artifact = artifactsById.get(file.artifactId)!;
      return { ...file, size: artifact.size, sha256: artifact.sha256 };
    }),
    sourceRunId: null,
  };
}

async function resolveRunArtifacts(
  connection: Connection,
  source: { projectId: string; runId: string; prefix: string },
): Promise<ResolvedDatasetContent> {
  await findRun(connection, { projectId: source.projectId, id: source.runId });
  const prefix = directoryPrefix(source.prefix);
  // 同じパスへの古いアップロードは置き換わっている。バージョンには今のRunに見えているものを取る。
  const page = await listRunArtifacts(connection, {
    projectId: source.projectId,
    runId: source.runId,
    prefix,
    directFilesOnly: false,
    versions: 'latest',
    limit: MAX_DATASET_VERSION_FILES,
  });
  if (page.nextCursor) tooManyFiles();
  if (!page.items.length)
    throw new DomainError({
      status: 422,
      code: 'dataset_content_empty',
      message: 'there are no artifacts of the run under the prefix',
    });
  return {
    files: page.items.map((artifact) => ({
      path: artifact.path.slice(prefix.length),
      artifactId: artifact.id,
      size: artifact.size,
      sha256: artifact.sha256,
    })),
    sourceRunId: source.runId,
  };
}

function tooManyFiles(): never {
  throw new DomainError({
    status: 422,
    code: 'dataset_too_many_files',
    message: `a dataset version can have at most ${MAX_DATASET_VERSION_FILES} files`,
    details: { limit: MAX_DATASET_VERSION_FILES },
  });
}

interface DatasetVersionLocation {
  projectId: string;
  datasetId: string;
  versionId: string;
}

/** ファイルの一覧はパスの順。カーソルは前のページの最後のパス。 */
function encodeFileCursor(path: string): string {
  return Buffer.from(JSON.stringify({ path })).toString('base64url');
}

function decodeFileCursor(token: string): string {
  try {
    const cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as unknown;
    if (typeof cursor === 'object' && cursor !== null && 'path' in cursor) {
      const { path } = cursor;
      if (typeof path === 'string') return path;
    }
  } catch {
    // 下で、ほかの不正なカーソルと同じように報告する。
  }
  throw new DomainError({ status: 400, code: 'invalid_cursor', message: 'invalid cursor' });
}

/** DatasetVersionのファイルを読み、保存済みのArtifactを中身から探す。 */
export class DatasetContentService {
  constructor(private readonly database: Database) {}

  async listFiles(
    principal: Principal,
    request: DatasetVersionLocation & { query: DatasetFileListQuery },
  ): Promise<DatasetVersionFilePage> {
    await this.requireReadAccess(principal, request.projectId);
    await this.requireVersion(request);
    const { query } = request;
    const prefix = directoryPrefix(query.prefix);
    const after = query.cursor ? decodeFileCursor(query.cursor) : null;
    const files = await rows<DatasetVersionFile>(
      this.database,
      `SELECT f.path,f.artifact_id,f.size,f.sha256,a.mime_type FROM dataset_version_files f
       JOIN artifacts a ON a.id=f.artifact_id
       WHERE f.dataset_version_id=$1 AND starts_with(f.path,$2)
         AND (NOT $3::boolean OR strpos(substr(f.path,length($2)+1),'/')=0)
         AND ($4::text IS NULL OR f.path>$4)
       ORDER BY f.path LIMIT $5`,
      [request.versionId, prefix, query.delimiter === '/', after, query.limit + 1],
    );
    const items = files.slice(0, query.limit);
    return files.length > query.limit
      ? { items, nextCursor: encodeFileCursor(items.at(-1)!.path) }
      : { items };
  }

  /** バージョンのファイルのうち1階層分。RunのArtifactツリーと同じ形で返す。 */
  async fileTree(
    principal: Principal,
    request: DatasetVersionLocation & { prefix: string },
  ): Promise<ArtifactTree> {
    await this.requireReadAccess(principal, request.projectId);
    await this.requireVersion(request);
    const prefix = directoryPrefix(request.prefix);
    const groups = await rows<ArtifactTreeGroup>(
      this.database,
      `SELECT child,count(*) AS file_count,sum(size) AS total_size FROM (
         SELECT size,CASE WHEN strpos(substr(path,length($2)+1),'/')=0 THEN ''
                     ELSE split_part(substr(path,length($2)+1),'/',1) END AS child
         FROM dataset_version_files WHERE dataset_version_id=$1 AND starts_with(path,$2)
       ) listed GROUP BY child ORDER BY child LIMIT $3`,
      [request.versionId, prefix, MAX_TREE_DIRECTORIES + 2],
    );
    return artifactTreeFromGroups(prefix, groups);
  }

  /**
   * 同じ中身を持つ、Projectで最も新しい保存済みのArtifact。クライアントは同じバイト列をもう一度
   * アップロードする代わりに、それをDatasetVersionに並べられる。バイト列はArtifact間で共有しない。
   * 一致したものは参照として使い回すだけ。
   */
  async findArtifactByDigest(
    principal: Principal,
    request: { projectId: string; sha256: string; size: number },
  ): Promise<Artifact> {
    await this.requireReadAccess(principal, request.projectId);
    const artifact = await first<Artifact>(
      this.database,
      `SELECT * FROM artifacts WHERE project_id=$1 AND sha256=$2 AND size=$3 AND deleted_at IS NULL
       ORDER BY created_at DESC,id DESC LIMIT 1`,
      [request.projectId, request.sha256, request.size],
    );
    if (!artifact) notFound('artifact');
    return artifact;
  }

  private async requireVersion(location: DatasetVersionLocation): Promise<void> {
    const version = await first(
      this.database,
      'SELECT 1 FROM dataset_versions WHERE id=$1 AND dataset_id=$2 AND project_id=$3',
      [location.versionId, location.datasetId, location.projectId],
    );
    if (!version) notFound('dataset version');
  }

  private async requireReadAccess(principal: Principal, projectId: string): Promise<void> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
  }
}
