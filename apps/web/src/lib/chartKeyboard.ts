import type { MetricXRange } from '@mmt/contracts';
import type { ChartScale } from './chartScale';
import type { ChartLine } from './metricSeries';

// "+" shows this share of the current x range around the cursor; "-" shows the inverse.
const KEYBOARD_ZOOM_FACTOR = 0.5;

/** The keys the metric chart answers while it has focus, beside the pointer's hover and drag. */
export type ChartCursorKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';
export type ChartZoomKey = '+' | '-';

/** The modifier keys held with a key press, as a keyboard event reports them. */
export interface ChartKeyModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * Whether the key press is the browser's, which the chart leaves alone: Ctrl or Cmd with + and -
 * zoom the page, Alt with ← and → go back and forward. Shift is not counted, as typing "+" needs it.
 */
export const isBrowserShortcut = ({ ctrlKey, metaKey, altKey }: ChartKeyModifiers): boolean =>
  ctrlKey || metaKey || altKey;

export const isChartCursorKey = (key: string): key is ChartCursorKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';
// "=" is "+" without Shift on most keyboards.
export const chartZoomKeyOf = (key: string): ChartZoomKey | null =>
  key === '+' || key === '=' ? '+' : key === '-' ? '-' : null;

/** Where the keyboard cursor can stop: every x a drawn line has inside the shown range, sorted. */
export function chartCursorStops(
  lines: readonly ChartLine[],
  [minX, maxX]: readonly [number, number],
): number[] {
  const stops = new Set<number>();
  for (const line of lines)
    for (const point of line.points) if (point.x >= minX && point.x <= maxX) stops.add(point.x);
  return [...stops].sort((left, right) => left - right);
}

/**
 * The next x of the cursor. The first arrow press starts at the end it points away from, so → shows
 * the first value and ← the last; null when there is nothing to show.
 */
export function moveChartCursor({
  stops,
  current,
  key,
}: {
  stops: readonly number[];
  current: number | null;
  key: ChartCursorKey;
}): number | null {
  if (!stops.length) return null;
  const first = stops[0]!;
  const last = stops.at(-1)!;
  if (key === 'Home') return first;
  if (key === 'End') return last;
  if (current === null) return key === 'ArrowRight' ? first : last;
  if (key === 'ArrowRight') return stops.find((x) => x > current) ?? last;
  return stops.findLast((x) => x < current) ?? first;
}

/**
 * The x range after "+" (half as wide, around `center`) or "-" (twice as wide). Null means the whole
 * x extent: zooming out past it resets the zoom. A log axis zooms by factors so the cursor stays put.
 */
export function zoomedChartRange({
  shown,
  extent,
  center,
  key,
  scale,
}: {
  shown: readonly [number, number];
  extent: readonly [number, number];
  center: number | null;
  key: ChartZoomKey;
  scale: ChartScale;
}): MetricXRange | null {
  const toAxis = (x: number) => (scale === 'log' ? Math.log10(x) : x);
  const fromAxis = (position: number) => (scale === 'log' ? 10 ** position : position);
  const [low, high] = [toAxis(shown[0]), toAxis(shown[1])];
  const middle = center === null ? (low + high) / 2 : toAxis(center);
  const factor = key === '+' ? KEYBOARD_ZOOM_FACTOR : 1 / KEYBOARD_ZOOM_FACTOR;
  const min = middle - (middle - low) * factor;
  const max = middle + (high - middle) * factor;
  if (key === '-' && min <= toAxis(extent[0]) && max >= toAxis(extent[1])) return null;
  return {
    min: Math.max(fromAxis(min), extent[0]),
    max: Math.min(fromAxis(max), extent[1]),
  };
}
