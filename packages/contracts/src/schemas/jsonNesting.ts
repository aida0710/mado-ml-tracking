/**
 * 解析済みのJSONの値で、配列とオブジェクトの入れ子が`maxDepth`より深いか（`{}`と`[]`は1段、
 * スカラーは0段）。再帰を使わずにたどり、深すぎる最初の段で止まる。そのため、数千段の入れ子の
 * 値は、あとに続く再帰的なJSONの検証でスタックをあふれさせる前に拒否される。
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
