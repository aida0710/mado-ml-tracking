import { useState } from 'react';
import { EXECUTION_POLL_MS, useQuery, type QueryState } from './useQuery';

/**
 * 最新の値にまだ進行中の処理があるときだけポーリングするuseQuery。終わった結果を開いたままの
 * ページは要求を送らなくなる。読み直しで新しい処理が届けば、ポーリングを再開する。
 */
export function useQueryPolledWhileActive<T>(
  key: string | null,
  loader: (signal: AbortSignal) => Promise<T>,
  isActive: (value: T) => boolean,
): QueryState<T> {
  const [isPolling, setPolling] = useState(true);
  const query = useQuery({ key, load: loader, pollMs: isPolling ? EXECUTION_POLL_MS : undefined });
  // キーにまだ値が無い間は、前の判断を保つ。
  const shouldPoll = query.value === undefined ? isPolling : isActive(query.value);
  if (shouldPoll !== isPolling) setPolling(shouldPoll);
  return query;
}
