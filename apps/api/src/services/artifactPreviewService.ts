import type { Artifact, ArtifactPreview } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, rows, type Connection, type Database } from '../db/database.js';
import { previewKindsFor } from '../domain/artifactPreviewTargets.js';
import { notFound } from '../domain/errors.js';
import { requireProject } from './accessService.js';
import { isHeaderProbedMimeType } from './artifactMediaInfoService.js';

const ENQUEUE_SAVEPOINT = 'artifact_previews';
const ARTIFACT_PREVIEW_COLUMNS = `artifact_id,kind,status,preview_artifact_id,error,attempts,updated_at`;

/**
 * 登録したばかりのArtifactに要るプレビューを、登録のトランザクションの中でキューに入れる。
 * プレビューは補助的なものなので、挿入に失敗しても登録は失敗させず、savepointまで戻して
 * ログに残す。
 */
export async function enqueueArtifactPreviews(connection: Connection, artifact: Artifact): Promise<void> {
  const kinds = previewKindsFor({
    mimeType: artifact.mimeType,
    size: artifact.size,
    isHeaderProbed: isHeaderProbedMimeType(artifact.mimeType),
  });
  if (kinds.length === 0) return;
  await connection.query(`SAVEPOINT ${ENQUEUE_SAVEPOINT}`);
  try {
    await connection.query(
      `INSERT INTO artifact_previews(artifact_id,project_id,kind)
       SELECT $1,$2,kind FROM unnest($3::text[]) AS kind ON CONFLICT DO NOTHING`,
      [artifact.id, artifact.projectId, kinds],
    );
    await connection.query(`RELEASE SAVEPOINT ${ENQUEUE_SAVEPOINT}`);
  } catch (error) {
    await connection.query(`ROLLBACK TO SAVEPOINT ${ENQUEUE_SAVEPOINT}`);
    console.error(
      JSON.stringify({
        event: 'artifact_preview_enqueue_failed',
        artifactId: artifact.id,
        projectId: artifact.projectId,
        name: (error as Error).name,
      }),
    );
  }
}

export class ArtifactPreviewService {
  constructor(private readonly database: Database) {}

  /** プレビューが要らないArtifactは空の一覧。存在しない、または別のProjectのArtifactは404。 */
  async list(
    principal: Principal,
    target: { projectId: string; artifactId: string },
  ): Promise<ArtifactPreview[]> {
    await requireProject(this.database, principal, {
      projectId: target.projectId,
      role: 'viewer',
      scope: 'read',
    });
    const artifact = await first<{ id: string }>(
      this.database,
      'SELECT id FROM artifacts WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL',
      [target.artifactId, target.projectId],
    );
    if (!artifact) notFound('artifact');
    return rows<ArtifactPreview>(
      this.database,
      `SELECT ${ARTIFACT_PREVIEW_COLUMNS} FROM artifact_previews
       WHERE project_id=$1 AND artifact_id=$2 ORDER BY kind`,
      [target.projectId, target.artifactId],
    );
  }
}
