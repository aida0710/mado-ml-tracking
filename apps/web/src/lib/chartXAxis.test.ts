import { afterEach, describe, expect, it } from 'vitest';
import { formatElapsedSeconds, formatWallTimeTick, formatXTick, formatXValue } from './chartXAxis';
import { formatDateTimeSeconds } from './format';
import { setLocale } from '../i18n/locale';

afterEach(() => setLocale('ja'));

describe('x軸の目盛り', () => {
  it('stepは整数で表示し、桁が多いときは短縮する', () => {
    expect(formatXTick({ kind: 'step' }, 1234.4)).toBe('1234');
    expect(formatXTick({ kind: 'step' }, 1_250_000)).toBe('125万');
    expect(formatXValue({ kind: 'step' }, 1_250_000)).toBe('1250000');
  });

  it('短縮した大きなstepは、表と同じく表示言語の書き方にする', () => {
    setLocale('en');
    expect(formatXTick({ kind: 'step' }, 1_250_000)).toBe('1.25M');
  });

  it('経過時間は大きい方から2つの単位で表示する', () => {
    expect(formatElapsedSeconds(45.4)).toBe('45s');
    expect(formatElapsedSeconds(245)).toBe('4m05s');
    expect(formatElapsedSeconds(4980)).toBe('1h23m');
    expect(formatElapsedSeconds(2 * 86400 + 3 * 3600 + 59)).toBe('2d03h');
    expect(formatXTick({ kind: 'relative_time' }, 4980)).toBe('1h23m');
  });

  it('時刻はローカル時刻で、目盛りは月日と分まで、tooltipは秒まで出す', () => {
    const epochMilliseconds = new Date(2026, 9, 8, 13, 45, 7).getTime();
    expect(formatWallTimeTick(epochMilliseconds)).toBe('10/08 13:45');
    expect(formatXValue({ kind: 'wall_time' }, epochMilliseconds)).toBe('2026/10/08 13:45:07');
  });

  it('tooltipの時刻は、表と同じく表示言語の書き方にする', () => {
    const epochMilliseconds = new Date(2026, 9, 8, 13, 45, 7).getTime();
    setLocale('en');
    const tooltipTime = formatXValue({ kind: 'wall_time' }, epochMilliseconds);
    expect(tooltipTime).toBe(formatDateTimeSeconds(new Date(epochMilliseconds).toISOString()));
    expect(tooltipTime).not.toBe('2026/10/08 13:45:07');
  });

  it('メトリクスのx軸は数値として表示する', () => {
    expect(formatXTick({ kind: 'metric', metricKey: 'epoch' }, 1.5)).toBe('1.5');
  });
});
