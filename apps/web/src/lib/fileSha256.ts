// SHA-256 of a whole file, for telling whether a file on disk is the one an Artifact stores.
import { canDigest, sha256Hex } from './blobDigest';
import { createSha256 } from './sha256';

const MIB = 1024 * 1024;
/**
 * Web Crypto hashes one buffer only, so the whole file is read into memory; above this the file is
 * read in slices instead, which keeps memory flat at the cost of the slower bundled hash.
 */
const WHOLE_FILE_DIGEST_MAX_BYTES = 256 * MIB;
// The upload part size: one slice blocks the page for about 0.15 s with the bundled hash.
const FILE_SLICE_BYTES = 16 * MIB;

/** Lowercase hex, the form an Artifact's sha256 has. Each slice yields to the page between reads. */
export async function sha256OfFile(file: Blob, signal?: AbortSignal): Promise<string> {
  if (canDigest() && file.size <= WHOLE_FILE_DIGEST_MAX_BYTES) return sha256Hex(await file.arrayBuffer());
  const hasher = createSha256();
  for (let start = 0; start < file.size; start += FILE_SLICE_BYTES) {
    signal?.throwIfAborted();
    hasher.update(new Uint8Array(await file.slice(start, start + FILE_SLICE_BYTES).arrayBuffer()));
  }
  return hasher.digestHex();
}
