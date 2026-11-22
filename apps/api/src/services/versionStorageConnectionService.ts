import type { DatasetVersion, ModelVersion } from '@mmt/contracts';
import type { Principal } from '../auth/principal.js';
import { first, transaction, type Database } from '../db/database.js';
import { notFound } from '../domain/errors.js';
import type { VersionStorageConnectionUpdateInput } from '../domain/versionStorageConnectionValidation.js';
import type { RequestMetadata } from '../http/requestMetadata.js';
import { writeAuditEvent } from '../repositories/auditRepository.js';
import { datasetVersionSelect, modelVersionSelect } from '../repositories/registryRepository.js';
import { requireProject } from './accessService.js';
import {
  auditActor,
  NO_REQUEST_METADATA,
  recordDenial,
  type AuditEventDraft,
} from './auditService.js';
import type { DataCatalogConnectionService } from './dataCatalogConnectionService.js';

/** URLの`/:p/<datasets|models>/:id/versions/:v`が指すバージョン。`parentId`はDatasetかModelのID。 */
export interface VersionLocation {
  projectId: string;
  parentId: string;
  versionId: string;
}

interface VersionStorageConnectionChange {
  location: VersionLocation;
  input: VersionStorageConnectionUpdateInput;
}

/** データセットとモデルで違うのは、表・親の列・`s3://`かを見るURIの列・監査の名前だけ。 */
interface VersionKind<Version> {
  table: 'dataset_versions' | 'model_versions';
  parentColumn: 'dataset_id' | 'model_id';
  select: string;
  notFoundLabel: string;
  auditAction: string;
  auditResourceType: string;
  auditParentKey: 'datasetId' | 'modelId';
  storageUri: (version: Version) => string | null;
}

const DATASET_VERSION_KIND: VersionKind<DatasetVersion> = {
  table: 'dataset_versions',
  parentColumn: 'dataset_id',
  select: datasetVersionSelect,
  notFoundLabel: 'dataset version',
  auditAction: 'dataset.version.storage_connection.set',
  auditResourceType: 'dataset_version',
  auditParentKey: 'datasetId',
  storageUri: (version) => version.uri,
};

const MODEL_VERSION_KIND: VersionKind<ModelVersion> = {
  table: 'model_versions',
  parentColumn: 'model_id',
  select: modelVersionSelect,
  notFoundLabel: 'model version',
  auditAction: 'model.version.storage_connection.set',
  auditResourceType: 'model_version',
  auditParentKey: 'modelId',
  storageUri: (version) => version.weightsUri,
};

/**
 * 登録済みのバージョンの、mado S3 Data Catalogのストレージ接続のIDを付ける・直す・外す。
 * IDはリンクの行き先を決めるだけなので、バージョンの中身（URI・digest）は変えない。
 */
export class VersionStorageConnectionService {
  constructor(
    private readonly database: Database,
    private readonly dataCatalog: Pick<DataCatalogConnectionService, 'resolveStorageConnectionId'>,
  ) {}

  setOnDatasetVersion(
    principal: Principal,
    change: VersionStorageConnectionChange,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<DatasetVersion> {
    return this.set(DATASET_VERSION_KIND, principal, change, request);
  }

  setOnModelVersion(
    principal: Principal,
    change: VersionStorageConnectionChange,
    request: RequestMetadata = NO_REQUEST_METADATA,
  ): Promise<ModelVersion> {
    return this.set(MODEL_VERSION_KIND, principal, change, request);
  }

  private async set<Version extends { dataCatalogStorageConnectionId: string | null }>(
    kind: VersionKind<Version>,
    principal: Principal,
    change: VersionStorageConnectionChange,
    request: RequestMetadata,
  ): Promise<Version> {
    const { location, input } = change;
    const draft: AuditEventDraft = {
      ...auditActor(principal),
      ...request,
      action: kind.auditAction,
      resourceType: kind.auditResourceType,
      resourceId: location.versionId,
      projectId: location.projectId,
      details: {
        [kind.auditParentKey]: location.parentId,
        dataCatalogStorageConnectionId: input.dataCatalogStorageConnectionId,
      },
    };
    return recordDenial(this.database, draft, async () => {
      // 権限の無い呼び出し元には、ストレージ接続の指定の誤りより先に403を返す。知らないIDのときは
      // mado S3 Data Catalogへ読み直すので、トランザクションを開く前に確かめる。
      await this.requireWriteAccess(this.database, principal, location.projectId);
      const current = await this.find(kind, location);
      const dataCatalogStorageConnectionId = await this.dataCatalog.resolveStorageConnectionId({
        uri: kind.storageUri(current),
        storageConnectionId: input.dataCatalogStorageConnectionId,
      });
      // 同じ値の付け直しは何も変えない。DBは、何も変えないバージョンの更新を断る。
      if (dataCatalogStorageConnectionId === current.dataCatalogStorageConnectionId) return current;
      return transaction(this.database, async (connection) => {
        await this.requireWriteAccess(connection, principal, location.projectId);
        const updated = await connection.query(
          `UPDATE ${kind.table} SET data_catalog_storage_connection_id=$4
           WHERE project_id=$1 AND ${kind.parentColumn}=$2 AND id=$3
             AND data_catalog_storage_connection_id IS DISTINCT FROM $4`,
          [
            location.projectId,
            location.parentId,
            location.versionId,
            dataCatalogStorageConnectionId,
          ],
        );
        // 確かめたあとに、別の要求が同じ値にしたか、バージョンが消えた。読み直して今の姿を返す。
        if (!updated.rowCount) return this.find(kind, location, connection);
        await writeAuditEvent(connection, {
          ...draft,
          outcome: 'success',
          details: {
            ...draft.details,
            previousDataCatalogStorageConnectionId: current.dataCatalogStorageConnectionId,
          },
        });
        return this.find(kind, location, connection);
      });
    });
  }

  private requireWriteAccess(
    connection: Parameters<typeof requireProject>[0],
    principal: Principal,
    projectId: string,
  ) {
    return requireProject(connection, principal, {
      projectId,
      role: 'editor',
      scope: 'registry:write',
    });
  }

  private async find<Version>(
    kind: VersionKind<Version>,
    location: VersionLocation,
    connection: Parameters<typeof first>[0] = this.database,
  ): Promise<Version> {
    const version = await first<Version>(
      connection,
      `${kind.select} WHERE v.project_id=$1 AND v.${kind.parentColumn}=$2 AND v.id=$3`,
      [location.projectId, location.parentId, location.versionId],
    );
    if (!version) notFound(kind.notFoundLabel);
    return version;
  }
}
