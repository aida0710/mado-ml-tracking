// 選んだファイルが、途中のアップロードセッションが送っていたファイルと同じかを判断する。同じなら
// 残りのpartを続けて送れ、2つの違うファイルを1つのArtifactにつなげてしまうことが無い。
//
// ブラウザは再読み込みをまたいでファイルのハンドルを持たず、名前と更新時刻はファイルをコピーすると
// 変わる。そこで受け取り済みのpartを証拠にする。サーバーは各partのSHA-256を保存しているので、
// 選んだファイルはその位置で同じバイト列を持たなければならない。
import type { ArtifactUploadDetail, ArtifactUploadListItem, ArtifactUploadPart } from '@mmt/contracts';
import { sha256HexOnAnyOrigin } from './blobDigest';
import { blockerFromFailure, blockerFromSession, type ResumeBlocker } from './uploadResumeBlocker';

/**
 * 選んだファイルと比べる受け取り済みのpart。1つのモデルの2つのcheckpointは同じ大きさで、
 * 埋め込み層と出力層を固定したファインチューニングでは最初と最後のpartも変わらないので、
 * 等間隔に選んだ中間のpartも比べる。16 MiBのpartを4つ比べると、ハッシュをJavaScriptで計算する
 * http（非HTTPS）のオリジンでは約0.6秒かかる。すべてのpartを比べるとギガバイト単位で読むことになる。
 */
export const COMPARED_PART_LIMIT = 4;

export type FileMatch =
  | { kind: 'same'; /** まだ何も保存されていないので、別のファイルのバイトがつながることはない。 */ nothingSent: boolean }
  | { kind: 'sizeDiffers' }
  | { kind: 'contentDiffers' };

/** ファイルのバイト列[start, end)のSHA-256（16進）。 */
export type PartDigestReader = (range: { start: number; end: number }) => Promise<string>;

/** 受け取り済みのpartの最初と最後と、その間で等間隔に選んだもの。最大で`limit`個。 */
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

/** バイト範囲ごとに一度だけハッシュを計算する。同じファイルの複数のセッションが同じpartを求めるため。 */
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
 * 新しく選んだファイルと比べる価値のある途中のアップロード（大きさが同じで期限切れでないもの）。
 * このブラウザが同じ名前・時刻のファイルで始めたものを先にし、そのあとは進んでいるものから並べる。
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
 * セッションの今の状態を読み、ファイルをそれと照らし合わせる。セッションのことを表す拒否
 * （期限切れ、消えた、権限が無い）は続けられない理由（blocker）にする。ネットワークの切断や
 * サーバーのエラーは、そのときセッションについて何も分からないので例外を投げる。
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
  /** セッションを開いたのと同じFileオブジェクトか、すでに比べたもの。大きさだけを確かめる。 */
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
