import { useEffect, useRef } from 'react';

/** Async operations use this to discard results after their connection view is replaced. */
export function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}
