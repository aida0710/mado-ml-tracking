import { useLocale } from '../i18n/useLocale';
import { useEffect, useRef, useState } from 'react';
import { formatErrorMessage } from '../lib/errorMessage';

export function useMutation() {
  useLocale();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
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
    setFailure(null);
    try {
      return await operation();
    } catch (failure) {
      if (isMounted.current) setFailure({ cause: failure });
      return undefined;
    } finally {
      isRunning.current = false;
      if (isMounted.current) setPending(false);
    }
  }
  return {
    run,
    pending,
    error: failure ? formatErrorMessage(failure.cause) : null,
    clearError: () => setFailure(null),
  };
}
