// ファイルの一部分のSHA-256。任意のX-Part-SHA256の確認と、再開するファイルの照合に使う。
import { computeSha256Hex } from './sha256';

/** Web Cryptoはsecure contextでしか使えない。LANの素のhttpのoriginでは確認を省く。 */
export function canDigest(): boolean {
  return typeof crypto !== 'undefined' && crypto.subtle !== undefined;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 同梱の実装を使うので、素のhttpのoriginでも動く（メインスレッドで約100MB/s）。再開の前に照合する
 * いくつかの部分には十分だが、送るすべての部分に使うには遅い。
 */
export async function sha256HexOnAnyOrigin(bytes: ArrayBuffer): Promise<string> {
  return canDigest() ? sha256Hex(bytes) : computeSha256Hex(new Uint8Array(bytes));
}
