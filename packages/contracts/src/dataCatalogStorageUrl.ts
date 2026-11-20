// mado S3 Data Catalogの画面のURLと`s3://`のURIを相互に直す。画面のURLの形は
// mado S3 Data Catalogが決めている:
//   フォルダ: <画面のURL>/storage/<ストレージ接続ID>/<バケット>/<パス>/
//   ファイル: <画面のURL>/storage/<ストレージ接続ID>/<バケット>/<親のパス>/?preview=<キー>
// 末尾が`/`でないパスを開くと、mado S3 Data Catalogがファイルの形へ開き直す。

const S3_URI_PATTERN = /^s3:\/\/([^/]+)(?:\/(.*))?$/s;
const STORAGE_SEGMENT = 'storage';
// `/storage/<ストレージ接続ID>/edit-readme/<バケット>/…`はREADMEの編集画面で、バケットの中身ではない。
const README_EDIT_SEGMENT = 'edit-readme';
const PREVIEW_PARAMETER = 'preview';

export interface S3Location {
  bucket: string;
  /** バケットの中のキー。バケットそのものなら空文字。フォルダは末尾が`/`。 */
  key: string;
}

export function parseS3Uri(uri: string): S3Location | null {
  const match = S3_URI_PATTERN.exec(uri);
  return match ? { bucket: match[1]!, key: match[2] ?? '' } : null;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function decodeSegments(segments: string[]): string[] | null {
  try {
    return segments.map(decodeURIComponent);
  } catch {
    return null;
  }
}

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/** `location`を開く、mado S3 Data Catalogの画面のURL。 */
export function dataCatalogStorageUrl({
  dataCatalogUrl,
  storageConnectionId,
  location,
}: {
  dataCatalogUrl: string;
  storageConnectionId: string;
  location: S3Location;
}): string {
  return (
    `${withTrailingSlash(dataCatalogUrl)}${STORAGE_SEGMENT}/${encodeURIComponent(storageConnectionId)}` +
    `/${encodeURIComponent(location.bucket)}/${encodePath(location.key)}`
  );
}

/**
 * mado S3 Data Catalogの画面のURL（「Web URLをコピー」の値）が指す場所を、ストレージ接続と
 * `s3://`のURIにする。`dataCatalogUrl`の下のストレージの画面でなければnull。
 */
export function parseDataCatalogStorageUrl({
  dataCatalogUrl,
  storageUrl,
}: {
  dataCatalogUrl: string;
  storageUrl: string;
}): { storageConnectionId: string; uri: string } | null {
  const base = withTrailingSlash(dataCatalogUrl);
  if (!URL.canParse(storageUrl) || !URL.canParse(base)) return null;
  const parsed = new URL(storageUrl);
  const parsedBase = new URL(base);
  if (parsed.origin !== parsedBase.origin || !parsed.pathname.startsWith(parsedBase.pathname))
    return null;
  const segments = decodeSegments(parsed.pathname.slice(parsedBase.pathname.length).split('/'));
  if (!segments) return null;
  const [storage, storageConnectionId, bucket, ...path] = segments;
  if (
    storage !== STORAGE_SEGMENT ||
    !storageConnectionId ||
    !bucket ||
    bucket === README_EDIT_SEGMENT
  )
    return null;
  const previewKey = parsed.searchParams.get(PREVIEW_PARAMETER);
  return { storageConnectionId, uri: `s3://${bucket}/${previewKey || path.join('/')}` };
}
