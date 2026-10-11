// The time ruler under the audio viewer: where its ticks go for the visible range, and their labels.

import { fractionOfTime, type TimeRange } from './audioTimeline';

/**
 * Tick spacings, from 10ms (the finest zoom shows 50ms) to 10 minutes. Each is 2–2.5 times the
 * previous, so the ruler keeps a similar density at every zoom step.
 */
const TICK_STEPS_SECONDS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const LONGEST_TICK_STEP_SECONDS = 600;
// Ticks land on multiples of the step; this absorbs float error such as 0.1 * 3 = 0.30000000000000004.
const TICK_POSITION_EPSILON = 1e-9;

export interface TimeAxisTick {
  seconds: number;
  /** Position in the visible range, 0 at the left edge and 1 at the right. */
  fraction: number;
  label: string;
}

/** The smallest listed spacing that keeps the ticks at most `maxTickCount`; whole 10 minutes beyond the list. */
export function timeAxisStep(spanSeconds: number, maxTickCount: number): number {
  const count = Math.max(1, Math.floor(maxTickCount));
  const step = TICK_STEPS_SECONDS.find((candidate) => spanSeconds / candidate <= count);
  return step ?? Math.ceil(spanSeconds / count / LONGEST_TICK_STEP_SECONDS) * LONGEST_TICK_STEP_SECONDS;
}

/** m:ss, m:ss.s or m:ss.cc: as many decimals as the spacing needs to tell neighbouring ticks apart. */
export function formatTickTime(seconds: number, stepSeconds: number): string {
  const fractionDigits = stepSeconds < 0.1 ? 2 : stepSeconds < 1 ? 1 : 0;
  const unitsPerSecond = 10 ** fractionDigits;
  const totalUnits = Math.round(Math.max(0, seconds) * unitsPerSecond);
  const minutes = Math.floor(totalUnits / (60 * unitsPerSecond));
  const remainder = (totalUnits % (60 * unitsPerSecond)) / unitsPerSecond;
  const secondsWidth = fractionDigits ? 3 + fractionDigits : 2;
  return `${minutes}:${remainder.toFixed(fractionDigits).padStart(secondsWidth, '0')}`;
}

/** Ticks on whole multiples of the spacing inside the range, edges included. */
export function timeAxisTicks(range: TimeRange, maxTickCount: number): TimeAxisTick[] {
  const span = range.endSeconds - range.startSeconds;
  if (!(span > 0) || maxTickCount < 1) return [];
  const step = timeAxisStep(span, maxTickCount);
  const ticks: TimeAxisTick[] = [];
  // Audio time starts at 0; Math.max also turns the -0 that ceil(-epsilon) gives into 0.
  const first = Math.max(0, Math.ceil(range.startSeconds / step - TICK_POSITION_EPSILON));
  for (let index = first; index * step <= range.endSeconds + TICK_POSITION_EPSILON; index += 1) {
    const seconds = index * step;
    ticks.push({ seconds, fraction: fractionOfTime(seconds, range), label: formatTickTime(seconds, step) });
  }
  return ticks;
}
