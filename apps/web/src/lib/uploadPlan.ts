// 再開できるArtifactのアップロードを計画する純粋な処理（partの割り付け、再開の差分、再試行の
// 間隔、転送速度）。上限はdocs/api-contract.mdの/artifact-uploadsの契約に合わせる。

const MIB = 1024 * 1024;
/** これ未満のファイルは1回のPUTで送る。アップロードセッションを使うと要求が3回増えるため。 */
export const SINGLE_PUT_MAX_BYTES = 8 * MIB;
/** APIの既定と同じ。partSizeなしで作ったアップロードセッションも同じ割り付けになる。 */
export const DEFAULT_PART_SIZE_BYTES = 16 * MIB;
/** これより多いpartのアップロードセッションは、APIが拒否する（422 too_many_parts）。 */
export const MAX_PART_COUNT = 10_000;
/** 失敗した1つのpartを合計でこの回数まで試す。それでも駄目ならファイルを失敗として止める。 */
export const MAX_PART_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000;
// 切れたネットワークはたいてい数秒で戻る。それより長く待っても、失敗の知らせが遅れるだけ。
const RETRY_MAX_DELAY_MS = 30_000;
/** 転送速度はこの時間の範囲で平均し、1回の遅い進捗のイベントで見積もりが振れないようにする。 */
export const TRANSFER_RATE_WINDOW_MS = 5000;

export type UploadMethod = 'single' | 'multipart';

export interface PartRange {
  partNumber: number;
  /** 始点のバイト位置（含む）。 */
  start: number;
  /** 終点のバイト位置（含まない）。 */
  end: number;
}

export function chooseUploadMethod(fileSize: number): UploadMethod {
  return fileSize < SINGLE_PUT_MAX_BYTES ? 'single' : 'multipart';
}

/** partの大きさは、既定のままではMAX_PART_COUNTを超えるときだけ、MiB単位で大きくする。 */
export function choosePartSize(fileSize: number): number {
  const smallestAllowed = Math.ceil(Math.ceil(fileSize / MAX_PART_COUNT) / MIB) * MIB;
  return Math.max(DEFAULT_PART_SIZE_BYTES, smallestAllowed);
}

/** どのpartもpartSizeバイトで、最後のpartだけが残りを持つ。 */
export function planParts(fileSize: number, partSize: number): PartRange[] {
  if (partSize <= 0) throw new RangeError('partSize must be positive');
  const parts: PartRange[] = [];
  for (let start = 0; start < fileSize; start += partSize)
    parts.push({ partNumber: parts.length + 1, start, end: Math.min(start + partSize, fileSize) });
  return parts;
}

export function findMissingParts(parts: PartRange[], receivedPartNumbers: Iterable<number>): PartRange[] {
  const received = new Set(receivedPartNumbers);
  return parts.filter((part) => !received.has(part.partNumber));
}

export function sumPartBytes(parts: PartRange[]): number {
  return parts.reduce((total, part) => total + part.end - part.start, 0);
}

/**
 * ネットワークの切断（status 0）、タイムアウト、スロットリング、サーバーのエラーは試し直す価値がある。
 * partのチェックサムの不一致は途中でバイトが変わったことを表すので、送り直せば成功しうる。
 * ほかの4xxの応答（閉じた・期限切れのセッション、大きさの不一致）は、試し直しても変わらない。
 */
export function isRetryableFailure({ status, code }: { status: number; code?: string }): boolean {
  if (status === 0 || status === 408 || status === 429 || status >= 500) return true;
  return code === 'part_checksum_mismatch';
}

/** `attempt`はすでに試した回数で、1から始まる。 */
export function canRetry(attempt: number): boolean {
  return attempt < MAX_PART_ATTEMPTS;
}

/**
 * equal jitterを付けた指数バックオフ。待ち時間の半分は固定、半分はランダムにして、一緒に失敗した
 * 並列のpartが同じ瞬間に一斉に戻ってこないようにする。
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.round(exponential / 2 + (exponential / 2) * random());
}

export interface TransferSample {
  at: number;
  /** `at`の時点で、そのファイルについて確定したか送信中のバイトの合計。 */
  bytes: number;
}

/** 速度の時間の範囲に入るサンプルと、その直前の1つ（範囲の起点）を残す。 */
export function recordTransferSample(samples: TransferSample[], sample: TransferSample): TransferSample[] {
  const windowStart = sample.at - TRANSFER_RATE_WINDOW_MS;
  const firstInside = samples.findIndex((item) => item.at >= windowStart);
  const kept = firstInside === -1 ? samples.slice(-1) : samples.slice(Math.max(0, firstInside - 1));
  return [...kept, sample];
}

/** サンプル全体での毎秒のバイト数。時刻の違う2つのサンプルがそろうまではnull。 */
export function estimateTransferRate(samples: TransferSample[]): number | null {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last || last.at <= first.at) return null;
  return Math.max(0, ((last.bytes - first.bytes) * 1000) / (last.at - first.at));
}

export function estimateRemainingSeconds(remainingBytes: number, bytesPerSecond: number | null): number | null {
  if (bytesPerSecond === null || bytesPerSecond <= 0) return null;
  return Math.ceil(remainingBytes / bytesPerSecond);
}

/** 送り先のフォルダと、選んだフォルダの中でのファイルのパスを、1つのスラッシュでつなぐ。 */
export function joinArtifactPath(prefix: string, relativePath: string): string {
  return [prefix, relativePath]
    .flatMap((segment) => segment.split('/'))
    .filter((segment) => segment !== '')
    .join('/');
}
