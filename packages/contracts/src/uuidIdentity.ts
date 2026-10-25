/** UUIDの構文は各境界で検証する。大文字・小文字の違いは同一性を変えない。 */
export function isSameUuid(expectedId: string, actualId: string): boolean {
  return expectedId.toLowerCase() === actualId.toLowerCase();
}
