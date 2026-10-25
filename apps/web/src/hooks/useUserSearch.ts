import { accessApi } from '../api/access';
import { useQuery } from './useQuery';
import { useSettledValue } from './useSettledValue';

// Wait until typing pauses so each keystroke does not send its own search request.
export const USER_SEARCH_DEBOUNCE_MS = 300;

/** Users whose name, email or username starts with `query`, searched once typing pauses. */
export function useUserSearch(query: string) {
  const trimmedQuery = query.trim();
  const { settled: settledQuery, isSettling: isWaiting } = useSettledValue(
    trimmedQuery,
    USER_SEARCH_DEBOUNCE_MS,
  );
  // useQuery aborts the previous request when the key changes, so late answers never win.
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
