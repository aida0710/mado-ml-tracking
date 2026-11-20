import { parseDataCatalogStorageUrl, type DataCatalogReference } from '@mmt/contracts';
import { useLocale } from '../i18n/useLocale';
import { pluginsText } from '../i18n/plugins';

/**
 * URIの欄にmado S3 Data Catalogの画面のURLが入っているとき、`s3://`のURIとストレージ接続へ
 * 直すことを勧める。`https://`もURIとして有効なので、勝手には書き換えない。
 */
export function DataCatalogUrlSuggestion({
  dataCatalog,
  value,
  onAccept,
}: {
  dataCatalog: DataCatalogReference;
  value: string;
  /** `storageConnectionId`は、URLのストレージ接続が選べる一覧に無ければ空（選び直してもらう）。 */
  onAccept: (location: { uri: string; storageConnectionId: string }) => void;
}) {
  useLocale();
  const location =
    dataCatalog.url &&
    parseDataCatalogStorageUrl({ dataCatalogUrl: dataCatalog.url, storageUrl: value.trim() });
  if (!location) return null;
  return (
    <p className="notice action-notice" role="status">
      <span>
        {pluginsText.storageUrlIsDataCatalog}{' '}
        <span className="mono break-word">{location.uri}</span>
      </span>
      <button
        type="button"
        className="button small"
        onClick={() =>
          onAccept({
            uri: location.uri,
            storageConnectionId: dataCatalog.storageConnections.some(
              (storageConnection) => storageConnection.id === location.storageConnectionId,
            )
              ? location.storageConnectionId
              : '',
          })
        }
      >
        {pluginsText.useS3Uri}
      </button>
    </p>
  );
}
