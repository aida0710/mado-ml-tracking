import { text } from '../i18n/catalog';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
// スケジューラーが制限時間を書くときのように、時間は1日を超えてよい（72:00:00）。
const CLOCK_DURATION_PATTERN = /^(\d+):([0-5]\d):([0-5]\d)$/;
const TWO_DIGITS = 2;

/**
 * HH:MM:SSで書いた長さ（PBSのwalltime、Slurmの--time）の秒数。空ならnull。job shellがそのまま
 * スケジューラーに渡すので、それ以外の形は推測せずに拒む。
 */
export function parseClockDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = CLOCK_DURATION_PATTERN.exec(trimmed);
  if (!match) throw new Error(text.clockDurationError);
  const [hours, minutes, seconds] = match.slice(1).map(Number) as [number, number, number];
  return hours * SECONDS_PER_HOUR + minutes * SECONDS_PER_MINUTE + seconds;
}

/** 秒で表した長さのHH:MM:SSの形。nullは空文字列にする。 */
export function formatClockDuration(seconds: number | null): string {
  if (seconds === null) return '';
  const pad = (value: number) => String(value).padStart(TWO_DIGITS, '0');
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds % SECONDS_PER_MINUTE)}`;
}
