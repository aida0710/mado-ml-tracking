import { accessApi } from '../api/access';
import { useQuery } from './useQuery';
import { useSettledValue } from './useSettledValue';

// 入力が止まるまで待ち、キーを押すたびに検索の要求を送らないようにする。
export const USER_SEARCH_DEBOUNCE_MS = 300;

/** 名前・メールアドレス・ユーザー名が`query`で始まるユーザー。入力が止まってから検索する。 */
export function useUserSearch(query: string) {
  const trimmedQuery = query.trim();
  const { settled: settledQuery, isSettling: isWaiting } = useSettledValue(
    trimmedQuery,
    USER_SEARCH_DEBOUNCE_MS,
  );
  // useQueryはキーが変わると前の要求を中止するので、遅れて届いた答えが勝つことはない。
  const search = useQuery({ key: settledQuery ? `user-search:${settledQuery}` : null, load: (signal) =>
    accessApi.searchUsers(settledQuery, signal),
  });
  return {
    users: isWaiting ? [] : (search.value ?? []),
    searching: trimmedQuery !== '' && (isWaiting || search.loading),
    hasQuery: trimmedQuery !== '',
    error: isWaiting ? null : search.error,
  };
}
