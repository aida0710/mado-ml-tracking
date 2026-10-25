const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `value`がUUIDかどうか。APIが発行するidはすべてこの形。 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
