// 音声ビューアの時間軸の計算。拡大、移動、ポインターの位置、ループの範囲。

export interface TimeRange {
  startSeconds: number;
  endSeconds: number;
}

// 約50msより短いと、16kHzでの1024サンプルのSTFTフレーム（64ms）だけで表示全体を覆ってしまう。
export const MIN_VIEW_SECONDS = 0.05;
export const ZOOM_STEP = 2;

/** 幅は（収まるなら）保ち、範囲を[0, duration]の中へずらして戻す。 */
export function clampTimeRange(range: TimeRange, durationSeconds: number): TimeRange {
  const span = Math.min(durationSeconds, Math.max(0, range.endSeconds - range.startSeconds));
  const start = Math.min(Math.max(0, range.startSeconds), durationSeconds - span);
  return { startSeconds: start, endSeconds: start + span };
}

/**
 * 幅を1/factor倍にする（factor > 1で拡大）。`focusSeconds`を中心にし、その相対位置を保つ。
 * 結果が全体の長さを覆うときはnullを返す。
 */
export function zoomTimeRange(
  range: TimeRange,
  factor: number,
  focusSeconds: number,
  durationSeconds: number,
): TimeRange | null {
  const span = range.endSeconds - range.startSeconds;
  const nextSpan = Math.min(durationSeconds, Math.max(MIN_VIEW_SECONDS, span / factor));
  if (nextSpan >= durationSeconds) return null;
  const focus = Math.min(range.endSeconds, Math.max(range.startSeconds, focusSeconds));
  const ratio = span > 0 ? (focus - range.startSeconds) / span : 0.5;
  const start = focus - ratio * nextSpan;
  return clampTimeRange({ startSeconds: start, endSeconds: start + nextSpan }, durationSeconds);
}

export function timeAtFraction(fraction: number, range: TimeRange): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return range.startSeconds + clamped * (range.endSeconds - range.startSeconds);
}

/** 範囲の中での`seconds`の位置（0..1）。範囲の外の値は0..1の外になる。 */
export function fractionOfTime(seconds: number, range: TimeRange): number {
  const span = range.endSeconds - range.startSeconds;
  return span > 0 ? (seconds - range.startSeconds) / span : 0;
}

export function loopRangeBetween(first: number, second: number): TimeRange {
  return { startSeconds: Math.min(first, second), endSeconds: Math.max(first, second) };
}

/** m:ss.cc。耳を頼りにループの位置を決めるのに要る精度。 */
export function formatAudioTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalCentiseconds = Math.round(safe * 100);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const remainder = (totalCentiseconds % 6000) / 100;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
}
