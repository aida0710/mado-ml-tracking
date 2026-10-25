import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { notFound } from '../domain/errors.js';
import { assertDatasetVersionUnused } from '../domain/datasetVersionUsage.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import {
  countDatasetVersionReferences,
  deleteDatasetVersionWithFiles,
} from '../repositories/datasetVersionDeletionRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';

/**
 * どこからも参照されていないDatasetVersionを削除する。URIを打ち間違えて登録したものなど
 * （DELETE /projects/:p/datasets/:d/versions/:v）。登録できるのと同じく、editorが削除できる。
 */
export class DatasetVersionDeletionService {
  constructor(private readonly database: Database) {}

  async delete(
    principal: Principal,
    location: { projectId: string; datasetId: string; versionId: string },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<void> {
    const { projectId, datasetId, versionId } = location;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'dataset.version.delete',
      resourceType: 'dataset_version',
      resourceId: versionId,
      projectId,
      details: { datasetId },
    };
    await recordDenial(this.database, draft, () =>
      transaction(this.database, async (connection) => {
        await requireProject(connection, principal, {
          projectId,
          role: 'editor',
          scope: 'registry:write',
        });
        // 配列やJSONに持つ新しい参照（Run・Task・ルール・フックの入力、バージョンの親）は、
        // 先にバージョンのDatasetをロックする（lockDatasetsOfVersions）。そのため、下で
        // 数えられるか、待ったあとでバージョンが消えていると分かるかのどちらかになる。外部キーを
        // 持つ参照（Jobのpartition、出力の宣言、MLflowのinputs）はDBに任せる。
        const dataset = await first(
          connection,
          'SELECT id FROM datasets WHERE project_id=$1 AND id=$2 FOR UPDATE',
          [projectId, datasetId],
        );
        if (!dataset) notFound('dataset');
        const version = await first<{ version: string; digest: string }>(
          connection,
          'SELECT version,digest FROM dataset_versions WHERE project_id=$1 AND dataset_id=$2 AND id=$3 FOR UPDATE',
          [projectId, datasetId, versionId],
        );
        if (!version) notFound('dataset version');
        assertDatasetVersionUnused(
          await countDatasetVersionReferences(connection, { projectId, id: versionId }),
        );
        await deleteDatasetVersionWithFiles(connection, { projectId, id: versionId });
        // 監査ログはすべてのイベントをずっと残し、URIには署名つきのクエリが付くことがあるので、
        // イベントにはURIを入れずにバージョンを書く。
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { datasetId, version: version.version, digest: version.digest },
        });
      }),
    );
  }
}
