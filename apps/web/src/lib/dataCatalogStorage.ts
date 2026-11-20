import {
  dataCatalogStorageUrl,
  parseS3Uri,
  type DataCatalogReference,
  type DataCatalogStorageConnection,
} from '@mmt/contracts';

/** ストレージ接続を選ぶ必要があるか。接続済みで、URIが`s3://`のときだけ。 */
export function needsStorageConnection(reference: DataCatalogReference, uri: string): boolean {
  return reference.url !== null && parseS3Uri(uri.trim()) !== null;
}

/** 選択肢に出す名前。同じ名前のストレージ接続を種類で見分けられるようにする。 */
export function storageConnectionLabel(storageConnection: DataCatalogStorageConnection): string {
  return `${storageConnection.name} (${storageConnection.provider})`;
}

/**
 * `uri`をmado S3 Data Catalogで開くURL。ストレージ接続が今の一覧に無い（未接続、解除した、
 * 別のmado S3 Data Catalogに付け替えた）ときはundefined。
 */
export function dataCatalogStorageUrlOf(
  reference: DataCatalogReference,
  stored: { uri: string; storageConnectionId: string | null },
): string | undefined {
  const location = parseS3Uri(stored.uri);
  const isListed = reference.storageConnections.some(
    (storageConnection) => storageConnection.id === stored.storageConnectionId,
  );
  if (!reference.url || !location || !stored.storageConnectionId || !isListed) return undefined;
  return dataCatalogStorageUrl({
    dataCatalogUrl: reference.url,
    storageConnectionId: stored.storageConnectionId,
    location,
  });
}
