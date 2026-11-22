import { jsonRequestInit, requestJson } from '@mado/design-system/http';
import type { StorageConnectionReassignment } from '@mmt/contracts';
import {
  dataCatalogReferenceSchema,
  datasetVersionSchema,
  itemsOf,
  modelVersionSchema,
  storageConnectionReassignmentResultSchema,
  storageConnectionUsageSchema,
} from '@mmt/contracts/schemas';

/** `datasets`か`models`の下の、1つのバージョン。`parentId`はDatasetかModelのID。 */
export interface RegisteredVersionLocation {
  projectId: string;
  parentId: string;
  versionId: string;
}

function storageConnectionPath(kind: 'datasets' | 'models', location: RegisteredVersionLocation) {
  const ids = [location.projectId, location.parentId, location.versionId].map(encodeURIComponent);
  return `/api/projects/${ids[0]}/${kind}/${ids[1]}/versions/${ids[2]}/data-catalog-storage-connection`;
}

/** Projectのメンバーに見せる、mado S3 Data Catalogの画面のURLとストレージ接続。 */
export const dataCatalogStorageApi = {
  reference: (projectId: string, signal?: AbortSignal) =>
    requestJson(`/api/projects/${projectId}/data-catalog`, {
      schema: dataCatalogReferenceSchema,
      init: { signal },
    }),
  /** Projectの`s3://`のバージョンの数。バケットとストレージ接続ごと。 */
  storageConnectionUsage: (projectId: string, signal?: AbortSignal) =>
    requestJson(`/api/projects/${projectId}/data-catalog/storage-connection-usage`, {
      schema: itemsOf(storageConnectionUsageSchema),
      init: { signal },
    }),
  /** `from`のストレージ接続を持つ`s3://`のバージョンを、まとめて`to`へ付け替える。 */
  reassignStorageConnection: (projectId: string, reassignment: StorageConnectionReassignment) =>
    requestJson(`/api/projects/${projectId}/data-catalog/storage-connection-reassignments`, {
      schema: storageConnectionReassignmentResultSchema,
      init: jsonRequestInit('POST', reassignment),
    }),
  /** 登録済みのバージョンのストレージ接続を付ける・直す。nullで外す。 */
  setDatasetVersionStorageConnection: (
    location: RegisteredVersionLocation,
    dataCatalogStorageConnectionId: string | null,
  ) =>
    requestJson(storageConnectionPath('datasets', location), {
      schema: datasetVersionSchema,
      init: jsonRequestInit('PUT', { dataCatalogStorageConnectionId }),
    }),
  setModelVersionStorageConnection: (
    location: RegisteredVersionLocation,
    dataCatalogStorageConnectionId: string | null,
  ) =>
    requestJson(storageConnectionPath('models', location), {
      schema: modelVersionSchema,
      init: jsonRequestInit('PUT', { dataCatalogStorageConnectionId }),
    }),
};
