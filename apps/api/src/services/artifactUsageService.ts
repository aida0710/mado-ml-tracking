import type { ArtifactBackendUsage, ArtifactUsage } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { rows, type Database } from '../db/database.js';
import { unreferencedArtifactCondition } from '../repositories/artifactReferenceRepository.js';
import { requireProject } from './accessService.js';
import { currentRunArtifactCondition } from './artifactListing.js';

/** Projectの保存先ごとの保存バイト数。Projectの設定画面用。 */
export class ArtifactUsageService {
  constructor(
    private readonly database: Database,
    private readonly deleteGraceDays: number,
  ) {}

  async usage(principal: Principal, projectId: string): Promise<ArtifactUsage> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    // bigintの合計は文字列で届く。float8にすれば2^53バイト（8PiB）まで数値のまま扱える。
    const backends = await rows<ArtifactBackendUsage>(
      this.database,
      `SELECT a.backend,
         count(*) FILTER (WHERE a.deleted_at IS NULL)::int AS artifact_count,
         COALESCE(sum(a.size) FILTER (WHERE a.deleted_at IS NULL),0)::float8 AS total_bytes,
         count(*) FILTER (WHERE a.deleted_at IS NOT NULL AND d.blob_removed_at IS NULL)::int
           AS pending_deletion_count,
         COALESCE(sum(a.size) FILTER (WHERE a.deleted_at IS NOT NULL AND d.blob_removed_at IS NULL),0)::float8
           AS pending_deletion_bytes,
         count(*) FILTER (WHERE old_version)::int AS unreferenced_old_version_count,
         COALESCE(sum(a.size) FILTER (WHERE old_version),0)::float8 AS unreferenced_old_version_bytes
       FROM artifacts a
       LEFT JOIN artifact_deletions d ON d.artifact_id=a.id
       CROSS JOIN LATERAL (SELECT a.deleted_at IS NULL AND NOT ${currentRunArtifactCondition('a')}
         AND ${unreferencedArtifactCondition('a')} AS old_version) version
       WHERE a.project_id=$1 AND (a.deleted_at IS NULL OR d.blob_removed_at IS NULL)
       GROUP BY a.backend ORDER BY a.backend`,
      [projectId],
    );
    return { backends, deleteGraceDays: this.deleteGraceDays };
  }
}
