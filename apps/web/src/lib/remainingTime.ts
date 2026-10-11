// Time left of an upload in the display language: 47秒, 1分5秒, 2時間3分 in Japanese.
import { textTemplates } from '../i18n/catalog';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export function formatRemainingTime(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return textTemplates.durationSeconds(seconds);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (seconds < SECONDS_PER_HOUR) return textTemplates.durationMinutes(minutes, seconds % SECONDS_PER_MINUTE);
  return textTemplates.durationHours(Math.floor(seconds / SECONDS_PER_HOUR), minutes);
}
