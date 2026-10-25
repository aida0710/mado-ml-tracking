import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * A ref that always holds the value of the latest render, for event handlers, timers and
 * callbacks that must call the current prop without being recreated when it changes. It is
 * updated in a layout effect, which runs before any of those can, and must not be read in render.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
