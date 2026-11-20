import { ExternalLink } from 'lucide-react';
import type { DataCatalogReference } from '@mmt/contracts';
import { dataCatalogStorageUrlOf } from '../lib/dataCatalogStorage';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/**
 * データや重みの置き場所のURI。ストレージ接続を登録してあるものには、mado S3 Data Catalogの
 * その場所の画面へのリンクを添える。
 */
export function StorageUri({
  uri,
  storageConnectionId,
  dataCatalog,
}: {
  uri: string;
  storageConnectionId: string | null;
  dataCatalog: DataCatalogReference;
}) {
  useLocale();
  const dataCatalogUrl = dataCatalogStorageUrlOf(dataCatalog, { uri, storageConnectionId });
  return (
    <span className="storage-uri">
      <span className="mono break-word">{uri}</span>
      {dataCatalogUrl && (
        <a className="storage-uri-link" href={dataCatalogUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden="true" />
          {pluginsText.openInDataCatalog}
        </a>
      )}
    </span>
  );
}
