import { createHash } from 'node:crypto';

/**
 * digestがファイルごとに対象にする項目。ArtifactのIDは含めず、再アップロードしてもdigestが
 * 変わらないようにする。
 */
export interface DatasetManifestEntry {
  path: string;
  sha256: string;
  size: number;
}

const DIGEST_PREFIX = 'sha256:';

/** パスをUTF-8のバイト順に並べる。PostgreSQLのC照合順序と同じ順。 */
export function compareManifestPaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

/**
 * 正規化したmanifestのSHA-256の16進に`sha256:`を付けたもの。正規化したmanifestは、
 * `{"path","sha256","size"}`のオブジェクトをpathのUTF-8のバイト順に並べたJSON配列で、
 * キーはこの順、空白なし、ASCII以外はエスケープしない。Pythonでは
 * `json.dumps(entries, separators=(",", ":"), ensure_ascii=False)`で同じものを作れるので、
 * クライアントは手元のファイルとバージョンを照合できる。
 */
export function datasetManifestDigest(entries: readonly DatasetManifestEntry[]): string {
  const canonical = [...entries]
    .sort((left, right) => compareManifestPaths(left.path, right.path))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256, size: entry.size }));
  return DIGEST_PREFIX + createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}
