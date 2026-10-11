const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a UUID, the form of every id the API issues. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
