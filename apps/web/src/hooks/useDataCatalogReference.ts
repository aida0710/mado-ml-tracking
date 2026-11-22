import type { DataCatalogReference } from '@mmt/contracts';
import { dataCatalogStorageApi } from '../api/dataCatalogStorage';
import { useQuery } from './useQuery';

const NOT_CONNECTED: DataCatalogReference = { url: null, storageConnections: [] };

/**
 * mado S3 Data Catalogの画面のURLとストレージ接続。`reference`は、まだ読めていないときも
 * 読めなかったときも、未接続と同じ内容になる。リンクを出すだけの画面はそれで足りる。登録の
 * 画面は、ストレージ接続の欄を出せなかったことが分かるよう、`error`を見て読み込み直せるようにする。
 */
export function useDataCatalogReference(projectId: string): {
  reference: DataCatalogReference;
  error: string | null;
  reload: () => void;
} {
  const query = useQuery({
    key: `data-catalog-reference:${projectId}`,
    load: (signal) => dataCatalogStorageApi.reference(projectId, signal),
  });
  return { reference: query.value ?? NOT_CONNECTED, error: query.error, reload: query.reload };
}
