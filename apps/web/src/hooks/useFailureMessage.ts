import { useCallback, useState } from 'react';
import { formatErrorMessage } from '../lib/errorMessage';
import { useLocale } from '../i18n/useLocale';

export interface FailureMessage {
  /** The kept failure in the current display language; null when there is none. */
  message: string | null;
  setFailure: (cause: unknown) => void;
  clearFailure: () => void;
}

/**
 * Keeps a failure as it was thrown and puts it into words when read, so its message follows a
 * later change of display language. Text saved at the time would stay in the language it was made in.
 */
export function useFailureMessage(): FailureMessage {
  useLocale();
  // Wrapped so that a thrown falsy value still counts as a failure.
  const [failure, setFailureState] = useState<{ cause: unknown } | null>(null);
  const setFailure = useCallback((cause: unknown) => setFailureState({ cause }), []);
  const clearFailure = useCallback(() => setFailureState(null), []);
  return { message: failure ? formatErrorMessage(failure.cause) : null, setFailure, clearFailure };
}
