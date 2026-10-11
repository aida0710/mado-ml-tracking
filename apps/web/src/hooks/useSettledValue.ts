import { useEffect, useState } from 'react';

/**
 * `value` once it has stayed the same for `delayMs`, so a search starts when typing pauses
 * instead of on every keystroke. `isSettling` is true while a newer value is still waiting.
 */
export function useSettledValue<T>(value: T, delayMs: number): { settled: T; isSettling: boolean } {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return { settled, isSettling: !Object.is(settled, value) };
}
