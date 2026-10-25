import { useState } from 'react';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

/**
 * useQuery that polls only while the latest value still has work in progress, so a page left
 * open on finished results stops sending requests. A reload that brings new work resumes polling.
 */
export function useQueryPolledWhileActive<T>(
  key: string | null,
  loader: (signal: AbortSignal) => Promise<T>,
  isActive: (value: T) => boolean,
): QueryState<T> {
  const [isPolling, setPolling] = useState(true);
  const query = useQuery({ key, load: loader, pollMs: isPolling ? EXECUTION_POLL_MS : undefined });
  // While the key has no value yet, keep the previous decision.
  const shouldPoll = query.value === undefined ? isPolling : isActive(query.value);
  if (shouldPoll !== isPolling) setPolling(shouldPoll);
  return query;
}
