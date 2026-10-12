/**
 * Whether arrays and objects in a parsed JSON value nest deeper than `maxDepth` (`{}` and `[]` are
 * one level, a scalar none). It walks without recursion and stops at the first level too deep, so
 * a value nested thousands deep is refused instead of overflowing the stack of the recursive JSON
 * validation that runs after it.
 */
export function isJsonNestedDeeperThan(value: unknown, maxDepth: number): boolean {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (pending.length) {
    const { value: current, depth } = pending.pop()!;
    if (current === null || typeof current !== 'object') continue;
    const level = depth + 1;
    if (level > maxDepth) return true;
    for (const child of Array.isArray(current) ? current : Object.values(current))
      pending.push({ value: child, depth: level });
  }
  return false;
}
