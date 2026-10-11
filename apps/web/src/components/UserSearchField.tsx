import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { UserSearchResult } from '@mmt/contracts';
import { useUserSearch } from '../hooks/useUserSearch';
import { isComposingKey } from '../lib/imeComposition';
import { ErrorNotice } from './Feedback';
import { UserSummary } from './UserSummary';
import { text } from '../i18n/catalog';

const NO_UNAVAILABLE_USERS: ReadonlyMap<string, string> = new Map();

/**
 * Searches users by the start of their name, email or username and reports the one clicked.
 * Users in `excludedUserIds` (already chosen, or the signed-in user) are not offered. Users in
 * `unavailableUsers` (such as existing members) are listed but cannot be picked, with the reason
 * next to them, so nobody wonders why the person they look for is missing. The field empties after
 * a pick and takes the focus back, so the next user can be searched. Enter never submits the form
 * around the field; it picks the user when the search found exactly one that can be picked.
 * `autoFocus` focuses the field when it appears in place of a chosen user.
 */
export function UserSearchField({
  label,
  isRequired = false,
  excludedUserIds = [],
  unavailableUsers = NO_UNAVAILABLE_USERS,
  autoFocus = false,
  onPick,
}: {
  label: string;
  isRequired?: boolean;
  excludedUserIds?: readonly string[];
  /** Reason each listed user cannot be picked, by user id. */
  unavailableUsers?: ReadonlyMap<string, string>;
  autoFocus?: boolean;
  onPick: (user: UserSearchResult) => void;
}) {
  const inputId = useId();
  const resultsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const search = useUserSearch(query);
  const users = search.users.filter((user) => !excludedUserIds.includes(user.id));
  const pick = (user: UserSearchResult) => {
    onPick(user);
    setQuery('');
    // The picked user's button disappears; without this the focus would drop to the page.
    inputRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isComposingKey(event)) return;
    // The field sits inside dialog forms (creating a Project, adding a member), where Enter would
    // submit the form before a user is picked.
    event.preventDefault();
    const pickable = users.filter((user) => !unavailableUsers.has(user.id));
    const onlyMatch = pickable.length === 1 ? pickable[0] : undefined;
    if (onlyMatch) pick(onlyMatch);
  };
  return (
    <div className="field">
      <label htmlFor={inputId}>
        {label}
        {isRequired && (
          <span className="required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={query}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={text.userSearchPlaceholder}
        aria-controls={resultsId}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div id={resultsId} aria-live="polite">
        <ErrorNotice message={search.error} />
        {search.searching ? (
          <p className="muted">{text.loading}</p>
        ) : search.hasQuery && !search.error && !users.length ? (
          <p className="muted">{text.userSearchNoResults}</p>
        ) : (
          users.length > 0 && (
            <ul className="user-picker-results">
              {users.map((user) => {
                const unavailableReason = unavailableUsers.get(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      disabled={unavailableReason !== undefined}
                      aria-describedby={unavailableReason ? `${resultsId}-${user.id}` : undefined}
                      onClick={() => pick(user)}
                    >
                      <UserSummary user={user} />
                      {unavailableReason && (
                        <small id={`${resultsId}-${user.id}`} className="muted">
                          {unavailableReason}
                        </small>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
