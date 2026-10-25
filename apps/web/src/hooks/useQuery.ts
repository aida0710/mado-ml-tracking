import { useQuery as useDesignSystemQuery } from '@mado/design-system/react';
import { formatErrorMessage } from '../lib/errorMessage';
import { useLocale } from '../i18n/useLocale';

export interface QueryState<T> {
  value: T | undefined;
  loading: boolean;
  /** 最後の読み込みの失敗を今の表示言語の文にしたもの。失敗していなければnull。 */
  error: string | null;
  reload: () => void;
}
// 動いているRunとJobの画面を最新に保ちつつ、動きの無いレジストリの画面にはポーリングさせない。
export const EXECUTION_POLL_MS = 5000;

/**
 * `key`ごとにデータを読み込む（デザインシステムのuseQuery）。失敗は投げられたものを持っておき、読むときに
 * 文にするので、後から表示言語を変えても文がそれに従う。
 */
export function useQuery<T>({
  key,
  load,
  pollMs,
}: {
  key: string | null;
  load: (signal: AbortSignal) => Promise<T>;
  pollMs?: number;
}): QueryState<T> {
  useLocale();
  const query = useDesignSystemQuery({ key, load, pollMs });
  return { ...query, error: query.error === null ? null : formatErrorMessage(query.error) };
}
