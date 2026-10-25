import type { ArtifactUpload, ArtifactUploadPart } from '@mmt/contracts';
import { first, rows, type Connection } from '../db/database.js';
import { notFound } from '../domain/errors.js';

/**
 * 保存したままのセッション。クライアントには見せない保存先側の参照と作成者も含む。expectedSizeと
 * partSizeがnullになるのは、MLflowのセッション（ownerKindあり）をクライアントがまだ完了して
 * いない間だけ。ネイティブのセッションには必ずある。
 */
export interface ArtifactUploadRecord extends ArtifactUpload {
  /** MLflowのmultipartのセッションで設定する。完了時に対応付けるArtifactのパスの持ち主。 */
  ownerKind: 'run' | 'model' | null;
  ownerId: string | null;
  storageKey: string;
  backendUploadId: string;
  createdByUserId: string;
  createdByTokenId: string | null;
  createdByJobTokenId: string | null;
  finalizerAttempts: number;
}

// bigintの列はキャストし、対応付けた記録が数値を持つようにする。サイズは2^53未満に収まる。
export const artifactUploadColumns = `id,project_id,run_id,path,backend,storage_key,mime_type,
  expected_size::float8 AS expected_size,expected_sha256,part_size::float8 AS part_size,part_count,
  status,backend_upload_id,created_by_user_id,created_by_token_id,created_by_job_token_id,artifact_id,
  error,owner_kind,owner_id,
  finalizer_attempts,expires_at,created_at,updated_at`;

/** artifact_uploadsからのSELECTに足す列。セッションの一覧に出す、これまでに保存したバイト数。 */
export const receivedBytesColumn = `(SELECT coalesce(sum(part.size),0)::float8
  FROM artifact_upload_parts part WHERE part.upload_id=artifact_uploads.id) AS received_bytes`;

export async function findArtifactUpload(
  connection: Connection,
  reference: { projectId: string; id: string; lock?: boolean },
): Promise<ArtifactUploadRecord> {
  const upload = await first<ArtifactUploadRecord>(
    connection,
    `SELECT ${artifactUploadColumns} FROM artifact_uploads WHERE project_id=$1 AND id=$2
    ${reference.lock ? 'FOR UPDATE' : ''}`,
    [reference.projectId, reference.id],
  );
  if (!upload) notFound('upload session');
  return upload;
}

export async function listArtifactUploadParts(
  connection: Connection,
  uploadId: string,
): Promise<(ArtifactUploadPart & { etag: string })[]> {
  return rows(
    connection,
    `SELECT part_number,size,sha256,etag,received_at FROM artifact_upload_parts
    WHERE upload_id=$1 ORDER BY part_number`,
    [uploadId],
  );
}

export function publicArtifactUpload(upload: ArtifactUploadRecord): ArtifactUpload {
  return {
    id: upload.id,
    projectId: upload.projectId,
    runId: upload.runId,
    path: upload.path,
    backend: upload.backend,
    mimeType: upload.mimeType,
    expectedSize: upload.expectedSize,
    expectedSha256: upload.expectedSha256,
    partSize: upload.partSize,
    partCount: upload.partCount,
    status: upload.status,
    artifactId: upload.artifactId,
    error: upload.error,
    expiresAt: upload.expiresAt,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
  };
}

/** 最後以外のpartはセッションのpart sizeちょうどで、最後のpartが残りを持つ。 */
export function expectedPartBytes(
  upload: Pick<ArtifactUpload, 'expectedSize' | 'partSize' | 'partCount'>,
  partNumber: number,
): number {
  return partNumber < upload.partCount
    ? upload.partSize
    : upload.expectedSize - upload.partSize * (upload.partCount - 1);
}

/** RunがProjectに無いときはnull。 */
export async function runLifecycleStage(
  connection: Connection,
  reference: { projectId: string; runId: string },
): Promise<'active' | 'deleted' | null> {
  const run = await first<{ lifecycleStage: 'active' | 'deleted' }>(
    connection,
    'SELECT lifecycle_stage FROM runs WHERE project_id=$1 AND id=$2 FOR SHARE',
    [reference.projectId, reference.runId],
  );
  return run?.lifecycleStage ?? null;
}
