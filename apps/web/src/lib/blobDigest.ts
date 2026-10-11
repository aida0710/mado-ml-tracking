// SHA-256 of a file slice for the optional X-Part-SHA256 check and for matching a resumed file.
import { computeSha256Hex } from './sha256';

/** Web Crypto exists only in secure contexts; on a plain http LAN origin the check is skipped. */
export function canDigest(): boolean {
  return typeof crypto !== 'undefined' && crypto.subtle !== undefined;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Works on plain http origins too, through the bundled implementation (about 100 MB/s on the main
 * thread). That is fine for the few parts compared before a resume, not for every part sent.
 */
export async function sha256HexOnAnyOrigin(bytes: ArrayBuffer): Promise<string> {
  return canDigest() ? sha256Hex(bytes) : computeSha256Hex(new Uint8Array(bytes));
}
