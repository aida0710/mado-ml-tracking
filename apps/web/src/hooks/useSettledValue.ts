import { useEffect, useState } from 'react';

/**
 * `delayMs`の間変わらなかった`value`。キーを押すたびでなく、入力が止まってから検索を始めるのに
 * 使う。`isSettling`は、新しい値がまだ待っている間true。
 */
export function useSettledValue<T>(value: T, delayMs: number): { settled: T; isSettling: boolean } {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return { settled, isSettling: !Object.is(settled, value) };
}
