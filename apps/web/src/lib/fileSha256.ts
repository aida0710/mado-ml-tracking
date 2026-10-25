// ファイル全体のSHA-256。ディスク上のファイルがArtifactに保存したものと同じかを見分けるのに使う。
import { canDigest, sha256Hex } from './blobDigest';
import { createSha256 } from './sha256';

const MIB = 1024 * 1024;
/**
 * Web Cryptoは1つのbufferしかハッシュできないので、ファイル全体をメモリに読み込む。これを超える
 * ファイルは代わりに切り分けて読む。同梱のハッシュは遅いが、メモリの使用量は一定に保てる。
 */
const WHOLE_FILE_DIGEST_MAX_BYTES = 256 * MIB;
// アップロードのpartと同じ大きさ。同梱のハッシュでは、1切れでページが約0.15秒止まる。
const FILE_SLICE_BYTES = 16 * MIB;

/** Artifactのsha256と同じ小文字の16進数。読み込みの合間に、1切れごとにページへ処理を譲る。 */
export async function sha256OfFile(file: Blob, signal?: AbortSignal): Promise<string> {
  if (canDigest() && file.size <= WHOLE_FILE_DIGEST_MAX_BYTES) return sha256Hex(await file.arrayBuffer());
  const hasher = createSha256();
  for (let start = 0; start < file.size; start += FILE_SLICE_BYTES) {
    signal?.throwIfAborted();
    hasher.update(new Uint8Array(await file.slice(start, start + FILE_SLICE_BYTES).arrayBuffer()));
  }
  return hasher.digestHex();
}
