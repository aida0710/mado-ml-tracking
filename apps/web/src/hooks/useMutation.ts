import { useEffect, useRef, useState } from 'react';
import { useFailureMessage } from './useFailureMessage';

export function useMutation() {
  const [pending, setPending] = useState(false);
  const { message, setFailure, clearFailure } = useFailureMessage();
  const isMounted = useRef(true);
  const isRunning = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  async function run<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (isRunning.current) return undefined;
    isRunning.current = true;
    setPending(true);
    clearFailure();
    try {
      return await operation();
    } catch (failure) {
      if (isMounted.current) setFailure(failure);
      return undefined;
    } finally {
      isRunning.current = false;
      if (isMounted.current) setPending(false);
    }
  }
  return {
    run,
    pending,
    error: message,
    clearError: clearFailure,
  };
}
