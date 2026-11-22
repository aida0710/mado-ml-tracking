import type {
  StorageConnectionReassignmentResult,
  StorageConnectionUsage,
} from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { rows, transaction, type Connection, type Database } from '../db/database.js';
import type { StorageConnectionReassignmentInput } from '../domain/storageConnectionReassignmentValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';
import type { DataCatalogConnectionService } from './dataCatalogConnectionService.js';

/** `s3://`のURIを持つ表と、そのURIの列。 */
const VERSION_TABLES = [
  { table: 'dataset_versions', uriColumn: 'uri', countKey: 'datasetVersions' },
  { table: 'model_versions', uriColumn: 'weights_uri', countKey: 'modelVersions' },
] as const;

// `s3://<バケット>/<キー>`のバケット。前方一致で比べると、名前が別のバケットの前半と同じとき
// （corpus と corpus-2）に取り違えるので、取り出して完全一致で比べる。
const bucketOf = (uriColumn: string) => `split_part(substr(${uriColumn}, 6), '/', 1)`;
// バケットの無い`s3:///…`は、URIとして読めないので数えも付け替えもしない（parseS3Uriと同じ）。
const isS3Uri = (uriColumn: string) =>
  `(left(${uriColumn}, 5)='s3://' AND ${bucketOf(uriColumn)}<>'')`;

/**
 * Projectの`s3://`のバージョンのストレージ接続を、バケットごとに数え、まとめて付け替える。
 * mado S3 Data Catalogへ接続する前に登録した分と、接続を作り直して合わなくなった分を、1件ずつ
 * 直さずに済ませる。
 */
export class StorageConnectionReassignmentService {
  constructor(
    private readonly database: Database,
    private readonly dataCatalog: Pick<
      DataCatalogConnectionService,
      'requireAssignableStorageConnection'
    >,
  ) {}

  async usage(principal: Principal, projectId: string): Promise<{ items: StorageConnectionUsage[] }> {
    await requireProject(this.database, principal, { projectId, role: 'viewer', scope: 'read' });
    const counted = await rows<StorageConnectionUsage>(
      this.database,
      `SELECT bucket, data_catalog_storage_connection_id,
         (count(*) FILTER (WHERE kind='datasetVersions'))::int AS dataset_versions,
         (count(*) FILTER (WHERE kind='modelVersions'))::int AS model_versions
       FROM (${VERSION_TABLES.map(
         ({ table, uriColumn, countKey }) =>
           `SELECT '${countKey}' AS kind, ${bucketOf(uriColumn)} AS bucket, data_catalog_storage_connection_id
            FROM ${table} WHERE project_id=$1 AND ${isS3Uri(uriColumn)}`,
       ).join(' UNION ALL ')}) versions
       GROUP BY bucket, data_catalog_storage_connection_id
       ORDER BY bucket, data_catalog_storage_connection_id NULLS FIRST`,
      [projectId],
    );
    return { items: counted };
  }

  async reassign(
    principal: Principal,
    change: { projectId: string; input: StorageConnectionReassignmentInput },
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<StorageConnectionReassignmentResult> {
    const { projectId, input } = change;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: 'data_catalog.storage_connection.reassign',
      resourceType: 'project',
      resourceId: projectId,
      projectId,
      details: {
        bucket: input.bucket ?? null,
        fromDataCatalogStorageConnectionId: input.fromDataCatalogStorageConnectionId,
        toDataCatalogStorageConnectionId: input.toDataCatalogStorageConnectionId,
      },
    };
    return recordDenial(this.database, draft, async () => {
      // 権限の無い呼び出し元には、指定の誤りより先に403を返す。知らないIDのときはmado S3 Data
      // Catalogへ読み直すので、トランザクションを開く前に確かめる。
      await this.requireWriteAccess(this.database, principal, projectId);
      if (input.toDataCatalogStorageConnectionId !== null)
        await this.dataCatalog.requireAssignableStorageConnection(
          input.toDataCatalogStorageConnectionId,
        );
      return transaction(this.database, async (connection) => {
        await this.requireWriteAccess(connection, principal, projectId);
        const result: StorageConnectionReassignmentResult = { datasetVersions: 0, modelVersions: 0 };
        for (const { table, uriColumn, countKey } of VERSION_TABLES) {
          const updated = await connection.query(
            `UPDATE ${table} SET data_catalog_storage_connection_id=$3
             WHERE project_id=$1 AND ${isS3Uri(uriColumn)}
               AND data_catalog_storage_connection_id IS NOT DISTINCT FROM $2
               AND ($4::text IS NULL OR ${bucketOf(uriColumn)}=$4)`,
            [
              projectId,
              input.fromDataCatalogStorageConnectionId,
              input.toDataCatalogStorageConnectionId,
              input.bucket ?? null,
            ],
          );
          result[countKey] = updated.rowCount ?? 0;
        }
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: { ...draft.details, ...result },
        });
        return result;
      });
    });
  }

  private requireWriteAccess(connection: Connection, principal: Principal, projectId: string) {
    return requireProject(connection, principal, {
      projectId,
      role: 'editor',
      scope: 'registry:write',
    });
  }
}
