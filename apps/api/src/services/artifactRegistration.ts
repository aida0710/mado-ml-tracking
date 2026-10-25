import type { Artifact, ArtifactBackend } from '@mmt/contracts';
import type { ArtifactStores } from '@mmt/platform';
import { first, type Connection } from '../db/database.js';
import { DomainError } from '../domain/errors.js';
import { isRelativeFilePath } from '../domain/validation.js';
import { recordArtifactMediaInfo } from './artifactMediaInfoService.js';
import { enqueueArtifactPreviews } from './artifactPreviewService.js';

// MLflowのArtifactのパスの索引列に合わせる。
const MAX_ARTIFACT_PATH_LENGTH = 1024;

export function assertArtifactPath(path: string): void {
  if (!isRelativeFilePath(path) || path.length > MAX_ARTIFACT_PATH_LENGTH)
    throw new DomainError({
      status: 422,
      code: 'invalid_artifact_path',
      message: 'an artifact requires a safe relative path',
    });
}

/**
 * 新しいArtifactはProjectの今の保存先に置く。その保存先はこのサーバーに設定されている必要がある。
 */
export async function projectArtifactBackend(
  connection: Connection,
  projectId: string,
  stores: ArtifactStores,
): Promise<ArtifactBackend> {
  const project = (await first<{ artifactBackend: ArtifactBackend }>(
    connection,
    'SELECT artifact_backend FROM projects WHERE id=$1',
    [projectId],
  ))!;
  if (!stores.backends().includes(project.artifactBackend))
    throw new DomainError({
      status: 503,
      code: 'backend_unavailable',
      message: 'artifact storage is not configured',
    });
  return project.artifactBackend;
}

/** 登録のトランザクションの中で動くので、対応付けに失敗すると見えるArtifactは残らない。 */
export type ArtifactStoredHook = (connection: Connection, artifact: Artifact) => Promise<void>;

export interface StoredArtifactRecord {
  id: string;
  projectId: string;
  runId: string | null;
  path: string;
  backend: ArtifactBackend;
  storageKey: string;
  mimeType: string;
  size: number;
  sha256: string;
}

export interface ArtifactRegistrationOptions {
  /** バイト列を持つstore。登録のときにここから音声ヘッダーを読み戻す。 */
  stores: ArtifactStores;
  onStored?: ArtifactStoredHook;
}

/**
 * 保存先に書き終えたバイト列を登録する。リクエスト1回でのアップロードも、アップロードセッションも
 * ここで終わるので、同じArtifactを作り、同じ互換のためのフックを動かし、同じ音声のメディア情報を
 * 記録する。プレビューはヘッダーの読み取りのあとでキューに入れる。プレビューのworkerは、
 * ヘッダーの読み取りでメディア情報が残らなかったときだけそれを埋める。
 */
export async function registerStoredArtifact(
  connection: Connection,
  record: StoredArtifactRecord,
  options: ArtifactRegistrationOptions,
): Promise<Artifact> {
  const artifact = (await first<Artifact>(
    connection,
    `INSERT INTO artifacts(id,project_id,run_id,path,backend,storage_key,mime_type,size,sha256)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      record.id,
      record.projectId,
      record.runId,
      record.path,
      record.backend,
      record.storageKey,
      record.mimeType,
      record.size,
      record.sha256,
    ],
  ))!;
  await options.onStored?.(connection, artifact);
  await recordArtifactMediaInfo(connection, { artifact, stores: options.stores });
  await enqueueArtifactPreviews(connection, artifact);
  return artifact;
}
