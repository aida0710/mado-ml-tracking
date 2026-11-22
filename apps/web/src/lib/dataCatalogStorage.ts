import {
  dataCatalogStorageUrl,
  parseS3Uri,
  type DataCatalogReference,
  type DataCatalogStorageConnection,
} from '@mmt/contracts';

/** ストレージ接続を選べるか。接続済みで、URIが`s3://`のときだけ。選ぶかどうかは任意。 */
export function acceptsStorageConnection(reference: DataCatalogReference, uri: string): boolean {
  return reference.url !== null && parseS3Uri(uri.trim()) !== null;
}

/** 選択肢に出す名前。同じ名前のストレージ接続を種類で見分けられるようにする。 */
export function storageConnectionLabel(storageConnection: DataCatalogStorageConnection): string {
  return `${storageConnection.name} (${storageConnection.provider})`;
}

/**
 * 選択肢。先頭は未設定。`current`が今の一覧に無いID（mado S3 Data Catalogで接続を作り直した
 * など）なら、選び直すまで値が消えないよう、見つからない接続として選択肢に残す。
 */
export function storageConnectionOptions(
  storageConnections: DataCatalogStorageConnection[],
  texts: { unset: string; notFound: string },
  current = '',
): { value: string; label: string }[] {
  const isListed = storageConnections.some((storageConnection) => storageConnection.id === current);
  return [
    { value: '', label: texts.unset },
    ...storageConnections.map((storageConnection) => ({
      value: storageConnection.id,
      label: storageConnectionLabel(storageConnection),
    })),
    ...(current && !isListed ? [{ value: current, label: `${texts.notFound} (${current})` }] : []),
  ];
}

/** バージョンに登録してあるIDが、今の一覧に無いか。未接続のサイトでは判断しない。 */
export function isStorageConnectionMissing(
  reference: DataCatalogReference,
  storageConnectionId: string | null,
): boolean {
  return (
    reference.url !== null &&
    storageConnectionId !== null &&
    !reference.storageConnections.some(
      (storageConnection) => storageConnection.id === storageConnectionId,
    )
  );
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
