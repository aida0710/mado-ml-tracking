import type { MetricXRange } from '@mmt/contracts';
import type { ChartScale } from './chartScale';
import type { ChartLine } from './metricSeries';

// "+"は、現在のxの範囲のうちこの割合をカーソルの周りに表示する。"-"はその逆数の割合を表示する。
const KEYBOARD_ZOOM_FACTOR = 0.5;

/** メトリクスの図がフォーカスを持つ間に応えるキー。ポインターのホバーとドラッグとは別。 */
export type ChartCursorKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';
export type ChartZoomKey = '+' | '-';

/** キーを押したときに押さえていた修飾キー。キーボードイベントが報告するとおり。 */
export interface ChartKeyModifiers {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * ブラウザのショートカットで、図が手を出さないキー操作か。Ctrl/Cmdと+・-はページの拡大縮小、
 * Altと←・→は戻る・進む。"+"の入力にShiftが要るので、Shiftは数えない。
 */
export const isBrowserShortcut = ({ ctrlKey, metaKey, altKey }: ChartKeyModifiers): boolean =>
  ctrlKey || metaKey || altKey;

export const isChartCursorKey = (key: string): key is ChartCursorKey =>
  key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';
// 多くのキーボードでは、"="はShiftなしの"+"。
export const chartZoomKeyOf = (key: string): ChartZoomKey | null =>
  key === '+' || key === '=' ? '+' : key === '-' ? '-' : null;

/** キーボードのカーソルが止まれる位置。表示範囲の中で、描いた線が持つすべてのx（昇順）。 */
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
 * カーソルの次のx。最初の矢印キーは、その向きと反対の端から始めるので、→は最初の値、←は最後の
 * 値を出す。出すものが無ければnull。
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
 * "+"（`center`を中心に半分の幅）か"-"（2倍の幅）の後のxの範囲。nullはxの全体の範囲を表し、
 * それを超えて縮小すると拡大を解く。対数軸は比で拡大するので、カーソルの位置は動かない。
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
