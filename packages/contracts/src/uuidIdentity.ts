/** UUID syntax is validated at each boundary; letter case does not change its identity. */
export function isSameUuid(expectedId: string, actualId: string): boolean {
  return expectedId.toLowerCase() === actualId.toLowerCase();
}
