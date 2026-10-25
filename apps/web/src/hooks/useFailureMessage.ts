import { useCallback, useState } from 'react';
import { formatErrorMessage } from '../lib/errorMessage';
import { useLocale } from '../i18n/useLocale';

export interface FailureMessage {
  /** 保持している失敗を、今の表示言語で表したもの。無ければnull。 */
  message: string | null;
  setFailure: (cause: unknown) => void;
  clearFailure: () => void;
}

/**
 * 失敗を投げられたまま保持し、読むときに文にする。こうすると、後で表示言語を変えてもメッセージが
 * それに従う。その時点で作った文は、作ったときの言語のまま残ってしまう。
 */
export function useFailureMessage(): FailureMessage {
  useLocale();
  // 包んでおき、falsyな値が投げられても失敗として数える。
  const [failure, setFailureState] = useState<{ cause: unknown } | null>(null);
  const setFailure = useCallback((cause: unknown) => setFailureState({ cause }), []);
  const clearFailure = useCallback(() => setFailureState(null), []);
  return { message: failure ? formatErrorMessage(failure.cause) : null, setFailure, clearFailure };
}
