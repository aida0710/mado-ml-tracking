import { requestJson } from '@mado/design-system/http';
import { dataCatalogReferenceSchema } from '@mmt/contracts/schemas';

/** Projectのメンバーに見せる、mado S3 Data Catalogの画面のURLとストレージ接続。 */
export const dataCatalogStorageApi = {
  reference: (projectId: string, signal?: AbortSignal) =>
    requestJson(`/api/projects/${projectId}/data-catalog`, {
      schema: dataCatalogReferenceSchema,
      init: { signal },
    }),
};
