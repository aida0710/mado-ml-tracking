/** HTML datetime-local fields use browser-local wall time, without a timezone suffix. */
export function formatLocalDateTimeInput(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const [month, day, hours, minutes] = [
    date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(),
  ].map(part => String(part).padStart(2, '0'));
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/** Rejects impossible dates and local times that daylight-saving changes skip. */
export function parseLocalDateTimeInput(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || formatLocalDateTimeInput(date) !== value) return undefined;
  return date;
}
