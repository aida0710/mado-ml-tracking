import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { formatErrorMessage } from '../lib/errorMessage';
import { useLocale } from '../i18n/useLocale';

export interface QueryState<T> {
  value: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
}
// Keep active Run and job views current without making idle registry pages poll.
export const EXECUTION_POLL_MS = 5000;

interface LoadState<T> {
  /** The key and reload count this state answers; a new pair starts a new load. */
  key: string | null;
  revision: number;
  value?: T;
  loading: boolean;
  failure: { cause: unknown } | null;
}

export function useQuery<T>(
  key: string | null,
  loader: (signal: AbortSignal) => Promise<T>,
  pollMs?: number,
): QueryState<T> {
  useLocale();
  const [revision, setRevision] = useState(0);
  const [storedState, setState] = useState<LoadState<T>>(() => ({
    key,
    revision,
    loading: key !== null,
    failure: null,
  }));
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  // A new key or a reload starts loading in this very render, so no render shows the old key's
  // result as settled. A reload of the same key keeps its value on screen until the new one arrives.
  const isStoredStateCurrent = storedState.key === key && storedState.revision === revision;
  const state: LoadState<T> = isStoredStateCurrent
    ? storedState
    : {
        key,
        revision,
        value: storedState.key === key ? storedState.value : undefined,
        loading: key !== null,
        failure: null,
      };
  if (!isStoredStateCurrent) setState(state);
  const load = useEffectEvent((signal: AbortSignal) => loader(signal));

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loadAndSchedule() {
      try {
        const value = await load(controller.signal);
        if (!controller.signal.aborted) setState({ key, revision, value, loading: false, failure: null });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            key,
            revision,
            loading: false,
            failure: { cause: error },
          });
      }
      if (!controller.signal.aborted && pollMs) timer = setTimeout(loadAndSchedule, pollMs);
    }
    void loadAndSchedule();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [key, revision, pollMs]);
  return {
    value: state.value,
    loading: state.loading,
    error: state.failure ? formatErrorMessage(state.failure.cause) : null,
    reload,
  };
}
