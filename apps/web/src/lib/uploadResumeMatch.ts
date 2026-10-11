// Decides whether a chosen file is the file an unfinished upload session was sending, so its
// remaining parts can follow without joining two different files into one Artifact.
//
// The browser keeps no handle to a file across reloads, and the name and modification time change
// when a file is copied, so the received parts are the evidence: the server stores each part's
// SHA-256, and the chosen file must have the same bytes at those offsets.
import type { ArtifactUploadDetail, ArtifactUploadListItem, ArtifactUploadPart } from '@mmt/contracts';
import { sha256HexOnAnyOrigin } from './blobDigest';
import { blockerFromFailure, blockerFromSession, type ResumeBlocker } from './uploadResumeBlocker';

/**
 * Received parts compared with the chosen file. Two checkpoints of one model have the same size,
 * and a fine-tune that froze the embedding and output layers also keeps the first and last parts,
 * so evenly spaced middle parts are compared too. Four 16 MiB parts take about 0.6 s on a plain
 * http origin, where the hash runs in JavaScript; comparing every part would read gigabytes.
 */
export const COMPARED_PART_LIMIT = 4;

export type FileMatch =
  | { kind: 'same'; /** Nothing is stored yet, so no bytes of another file can be joined. */ nothingSent: boolean }
  | { kind: 'sizeDiffers' }
  | { kind: 'contentDiffers' };

/** SHA-256 hex of the file's bytes [start, end). */
export type PartDigestReader = (range: { start: number; end: number }) => Promise<string>;

/** The first and last received parts and evenly spaced ones between them, at most `limit`. */
export function choosePartsToCompare(
  receivedParts: readonly ArtifactUploadPart[],
  limit: number = COMPARED_PART_LIMIT,
): ArtifactUploadPart[] {
  const sorted = [...receivedParts].sort((left, right) => left.partNumber - right.partNumber);
  if (sorted.length <= limit) return sorted;
  const lastIndex = sorted.length - 1;
  const indexes = new Set(Array.from({ length: limit }, (_, step) => Math.round((step * lastIndex) / (limit - 1))));
  return [...indexes].map((index) => sorted[index]!);
}

/** Hashes each byte range once, since several sessions of the same file ask for the same parts. */
export function createPartDigestReader(file: Blob): PartDigestReader {
  const digests = new Map<string, Promise<string>>();
  return ({ start, end }) => {
    const key = `${start}:${end}`;
    let digest = digests.get(key);
    if (!digest) {
      digest = file.slice(start, end).arrayBuffer().then(sha256HexOnAnyOrigin);
      digests.set(key, digest);
    }
    return digest;
  };
}

/**
 * Unfinished uploads worth comparing with a newly chosen file: same size and not expired. The ones
 * this browser started for a file of the same name and time come first, then the furthest along.
 */
export function orderResumeCandidates({
  sessions,
  fileSize,
  recordedUploadIds,
  now,
}: {
  sessions: readonly ArtifactUploadListItem[];
  fileSize: number;
  recordedUploadIds: ReadonlySet<string>;
  now: number;
}): ArtifactUploadListItem[] {
  const rank = (session: ArtifactUploadListItem) => (recordedUploadIds.has(session.id) ? 0 : 1);
  return sessions
    .filter((session) => session.expectedSize === fileSize && blockerFromSession(session, now) === null)
    .sort((left, right) => rank(left) - rank(right) || right.receivedBytes - left.receivedBytes);
}

export async function matchFileToSession({
  file,
  session,
  readPartDigest,
}: {
  file: Blob;
  session: Pick<ArtifactUploadDetail, 'expectedSize' | 'partSize' | 'receivedParts'>;
  readPartDigest: PartDigestReader;
}): Promise<FileMatch> {
  if (file.size !== session.expectedSize) return { kind: 'sizeDiffers' };
  const compared = choosePartsToCompare(session.receivedParts);
  if (compared.length === 0) return { kind: 'same', nothingSent: true };
  for (const part of compared) {
    const start = (part.partNumber - 1) * session.partSize;
    const end = start + part.size;
    if (end > file.size || (await readPartDigest({ start, end })) !== part.sha256) return { kind: 'contentDiffers' };
  }
  return { kind: 'same', nothingSent: false };
}

export type SessionInspection =
  | { blocker: ResumeBlocker; session: ArtifactUploadDetail | null }
  | { blocker: null; session: ArtifactUploadDetail; nothingSent: boolean };

/**
 * Reads the session's current state and checks the file against it. Refusals that describe the
 * session (expired, gone, no permission) become blockers; a lost network or a server error throws,
 * since nothing is known about the session then.
 */
export async function inspectSessionForFile({
  uploadId,
  file,
  loadSession,
  readPartDigest,
  now,
  isKnownSameFile = false,
}: {
  uploadId: string;
  file: Blob;
  loadSession: (uploadId: string) => Promise<ArtifactUploadDetail>;
  readPartDigest: PartDigestReader;
  now: number;
  /** The same File object that opened the session, or one already compared: only the size is checked. */
  isKnownSameFile?: boolean;
}): Promise<SessionInspection> {
  let session: ArtifactUploadDetail;
  try {
    session = await loadSession(uploadId);
  } catch (failure) {
    const blocker = blockerFromFailure(failure);
    if (blocker) return { blocker, session: null };
    throw failure;
  }
  const sessionBlocker = blockerFromSession(session, now);
  if (sessionBlocker) return { blocker: sessionBlocker, session };
  if (isKnownSameFile)
    return file.size === session.expectedSize
      ? { blocker: null, session, nothingSent: session.receivedParts.length === 0 }
      : { blocker: 'sizeDiffers', session };
  const match = await matchFileToSession({ file, session, readPartDigest });
  if (match.kind !== 'same') return { blocker: match.kind, session };
  return { blocker: null, session, nothingSent: match.nothingSent };
}
