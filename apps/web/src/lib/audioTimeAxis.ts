// 音声ビューアの下の時間の目盛り。見えている範囲のどこに目盛りを置くかと、そのラベル。

import { fractionOfTime, type TimeRange } from './audioTimeline';

/**
 * 目盛りの間隔。10ms（最も拡大したときの表示は50ms）から10分まで。どれも前の2〜2.5倍なので、
 * どの拡大の段階でも目盛りの密度が近くなる。
 */
const TICK_STEPS_SECONDS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const LONGEST_TICK_STEP_SECONDS = 600;
// 目盛りは間隔の倍数に置く。0.1 * 3 = 0.30000000000000004のような浮動小数点の誤差をここで吸収する。
const TICK_POSITION_EPSILON = 1e-9;

export interface TimeAxisTick {
  seconds: number;
  /** 見えている範囲の中の位置。左端が0、右端が1。 */
  fraction: number;
  label: string;
}

/** 目盛りを`maxTickCount`個以下に収める、一覧の中で最も狭い間隔。一覧を超えるときは10分の倍数。 */
export function timeAxisStep(spanSeconds: number, maxTickCount: number): number {
  const count = Math.max(1, Math.floor(maxTickCount));
  const step = TICK_STEPS_SECONDS.find((candidate) => spanSeconds / candidate <= count);
  return step ?? Math.ceil(spanSeconds / count / LONGEST_TICK_STEP_SECONDS) * LONGEST_TICK_STEP_SECONDS;
}

/** m:ss、m:ss.s、m:ss.cc。隣の目盛りと見分けられるだけの小数の桁数にする。 */
export function formatTickTime(seconds: number, stepSeconds: number): string {
  const fractionDigits = stepSeconds < 0.1 ? 2 : stepSeconds < 1 ? 1 : 0;
  const unitsPerSecond = 10 ** fractionDigits;
  const totalUnits = Math.round(Math.max(0, seconds) * unitsPerSecond);
  const minutes = Math.floor(totalUnits / (60 * unitsPerSecond));
  const remainder = (totalUnits % (60 * unitsPerSecond)) / unitsPerSecond;
  const secondsWidth = fractionDigits ? 3 + fractionDigits : 2;
  return `${minutes}:${remainder.toFixed(fractionDigits).padStart(secondsWidth, '0')}`;
}

/** 範囲の中で、間隔の整数倍の位置に置く目盛り。両端も含む。 */
export function timeAxisTicks(range: TimeRange, maxTickCount: number): TimeAxisTick[] {
  const span = range.endSeconds - range.startSeconds;
  if (!(span > 0) || maxTickCount < 1) return [];
  const step = timeAxisStep(span, maxTickCount);
  const ticks: TimeAxisTick[] = [];
  // 音声の時間は0から始まる。Math.maxは、ceil(-epsilon)が返す-0も0にする。
  const first = Math.max(0, Math.ceil(range.startSeconds / step - TICK_POSITION_EPSILON));
  for (let index = first; index * step <= range.endSeconds + TICK_POSITION_EPSILON; index += 1) {
    const seconds = index * step;
    ticks.push({ seconds, fraction: fractionOfTime(seconds, range), label: formatTickTime(seconds, step) });
  }
  return ticks;
}
