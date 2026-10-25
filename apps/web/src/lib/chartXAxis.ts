import type { ChartXAxis } from '@mmt/contracts';
import { formatCompactNumber, formatDateTimeSeconds, formatNumber } from './format';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
// この値未満のstepは全桁で書いても読みやすい。それより大きいものは、画面の表のセルと同じく、
// 表示言語の短い表記（1.2Mや120万）にする。
const FULL_STEP_TICK_LIMIT = 100_000;

/** xの値の目盛りの文字。整数のstep、1h23mのような経過時間、ローカルの日時のどれか。 */
export function formatXTick(xAxis: ChartXAxis, value: number): string {
  if (xAxis.kind === 'step') {
    const step = Math.round(value);
    return Math.abs(step) < FULL_STEP_TICK_LIMIT ? String(step) : formatCompactNumber(step);
  }
  if (xAxis.kind === 'relative_time') return formatElapsedSeconds(value);
  if (xAxis.kind === 'wall_time') return formatWallTimeTick(value);
  return formatNumber(value);
}

/** ツールチップに出すxの値の文字。目盛りより精密で、時刻は表と同じ書き方にする。 */
export function formatXValue(xAxis: ChartXAxis, value: number): string {
  if (xAxis.kind === 'step') return String(Math.round(value));
  if (xAxis.kind === 'relative_time') return formatElapsedSeconds(value);
  if (xAxis.kind === 'wall_time') return formatDateTimeSeconds(value);
  return formatNumber(value);
}

/**
 * 秒を大きい方から2つの単位で表す（45s、4m05s、1h23m、2d03h）。サンプリングした区間のxは平均
 * なので、先に整数の秒に丸める。
 */
export function formatElapsedSeconds(value: number): string {
  const sign = value < 0 ? '-' : '';
  const seconds = Math.round(Math.abs(value));
  if (seconds < SECONDS_PER_MINUTE) return `${sign}${seconds}s`;
  const [largeUnit, smallUnit, largeSuffix, smallSuffix] =
    seconds < SECONDS_PER_HOUR
      ? [SECONDS_PER_MINUTE, 1, 'm', 's']
      : seconds < SECONDS_PER_DAY
        ? [SECONDS_PER_HOUR, SECONDS_PER_MINUTE, 'h', 'm']
        : [SECONDS_PER_DAY, SECONDS_PER_HOUR, 'd', 'h'];
  const large = Math.floor(seconds / largeUnit);
  const small = Math.floor((seconds % largeUnit) / smallUnit);
  return `${sign}${large}${largeSuffix}${padTwoDigits(small)}${smallSuffix}`;
}

/** エポックからのミリ秒を、軸に収まる短いローカル時刻の目盛りにする（`10/08 13:45`）。 */
export function formatWallTimeTick(epochMilliseconds: number): string {
  const date = new Date(epochMilliseconds);
  const monthDay = `${padTwoDigits(date.getMonth() + 1)}/${padTwoDigits(date.getDate())}`;
  return `${monthDay} ${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`;
}

const padTwoDigits = (part: number) => String(part).padStart(2, '0');
