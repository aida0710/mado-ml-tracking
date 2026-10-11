import { describe, expect, it } from 'vitest';
import {
  chartCursorStops,
  chartZoomKeyOf,
  isBrowserShortcut,
  moveChartCursor,
  zoomedChartRange,
} from './chartKeyboard';
import type { ChartLine } from './metricSeries';

const line = (id: string, xs: number[]): ChartLine => ({
  id,
  label: id,
  kind: 'run',
  color: '#2a78d6',
  dashPattern: null,
  points: xs.map((x) => ({ x, value: x })),
  smoothedValues: xs,
  excludedCount: 0,
});

describe('図のキーボードの止まり先', () => {
  it('表示中の範囲にある x を線をまたいで重ねずに並べる', () => {
    expect(chartCursorStops([line('a', [0, 10, 20, 30]), line('b', [5, 10, 40])], [5, 30])).toEqual([5, 10, 20, 30]);
  });

  it('→ は最初の値から、← は最後の値から始まり、端で止まる', () => {
    const stops = [0, 10, 20];
    expect(moveChartCursor({ stops, current: null, key: 'ArrowRight' })).toBe(0);
    expect(moveChartCursor({ stops, current: null, key: 'ArrowLeft' })).toBe(20);
    expect(moveChartCursor({ stops, current: 10, key: 'ArrowRight' })).toBe(20);
    expect(moveChartCursor({ stops, current: 20, key: 'ArrowRight' })).toBe(20);
    expect(moveChartCursor({ stops, current: 0, key: 'ArrowLeft' })).toBe(0);
    expect(moveChartCursor({ stops, current: 10, key: 'End' })).toBe(20);
    expect(moveChartCursor({ stops: [], current: null, key: 'Home' })).toBeNull();
  });

  it('拡大したあとも、範囲の外にあった位置から近い値へ動く', () => {
    expect(moveChartCursor({ stops: [40, 50], current: 10, key: 'ArrowRight' })).toBe(40);
    expect(moveChartCursor({ stops: [40, 50], current: 90, key: 'ArrowLeft' })).toBe(50);
  });
});

describe('図のキーボードの拡大', () => {
  it('+ はカーソルを中心に幅を半分にし、全体の外へは出ない', () => {
    expect(zoomedChartRange({ shown: [0, 100], extent: [0, 100], center: 50, key: '+', scale: 'linear' })).toEqual({ min: 25, max: 75 });
    expect(zoomedChartRange({ shown: [0, 100], extent: [0, 100], center: 0, key: '+', scale: 'linear' })).toEqual({ min: 0, max: 50 });
    expect(zoomedChartRange({ shown: [0, 100], extent: [0, 100], center: null, key: '+', scale: 'linear' })).toEqual({ min: 25, max: 75 });
  });

  it('- は幅を倍にし、全体を超えたら拡大を戻す（null）', () => {
    expect(zoomedChartRange({ shown: [40, 60], extent: [0, 100], center: 50, key: '-', scale: 'linear' })).toEqual({ min: 30, max: 70 });
    expect(zoomedChartRange({ shown: [25, 75], extent: [0, 100], center: 50, key: '-', scale: 'linear' })).toBeNull();
  });

  it('対数軸では比で拡大する', () => {
    const range = zoomedChartRange({ shown: [1, 10000], extent: [1, 10000], center: 100, key: '+', scale: 'log' })!;
    expect(range.min).toBeCloseTo(10, 6);
    expect(range.max).toBeCloseTo(1000, 6);
  });

  it('Shift なしの = も + として扱う', () => {
    expect(chartZoomKeyOf('=')).toBe('+');
    expect(chartZoomKeyOf('-')).toBe('-');
    expect(chartZoomKeyOf('a')).toBeNull();
  });
});

describe('図が受け取らないキー', () => {
  const noModifiers = { ctrlKey: false, metaKey: false, altKey: false };

  it('Ctrl・Cmd・Alt と一緒のキーはブラウザの操作（ページの拡大・縮小、戻る・進む）として残す', () => {
    expect(isBrowserShortcut({ ...noModifiers, ctrlKey: true })).toBe(true);
    expect(isBrowserShortcut({ ...noModifiers, metaKey: true })).toBe(true);
    expect(isBrowserShortcut({ ...noModifiers, altKey: true })).toBe(true);
  });

  it('修飾キーなしのキーと、+ を打つための Shift だけのキーは図が受け取る', () => {
    expect(isBrowserShortcut(noModifiers)).toBe(false);
    expect(isBrowserShortcut({ ...noModifiers, shiftKey: true } as typeof noModifiers)).toBe(false);
  });
});
